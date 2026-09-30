import { levelFor, type Level } from "../theme/colors";
import { DIR_CODE } from "./model";
import type { Passage } from "./types";

export interface Step {
  name: string;
  component: string;
  start: number;
  dur: number;
  level: Level;
  pending?: boolean;
  async?: boolean;
}

export interface Journey {
  steps: Step[];
  /** Road to revenue (ms), excluding the asynchronous authority report. */
  total: number;
  pending: boolean;
}

/** Builds the trace-like waterfall of a transaction at simulation time `now`. */
export function journey(p: Passage, now: number): Journey {
  const steps: Step[] = [];
  let t = 0;
  const add = (name: string, component: string, dur: number, extra: Partial<Step> = {}) => {
    const s: Step = { name, component, start: t, dur, level: levelFor(dur, 999, 4999, false), ...extra };
    steps.push(s);
    if (!s.async) t += dur;
    return s;
  };
  const elapsed = Math.max(0, now - p.t);
  const lane = `${DIR_CODE[p.dir]} L${p.lane}`;
  const ms = p.ms;

  add("Detection at the gantry (laser + camera + reader)", `lane-controller ${lane}`, ms.detect);
  add(p.hasTag ? "Tag read + plate OCR" : "Plate OCR (LPR)", "ocr-engine · gpu-ocr-edge-01", ms.ocr);
  if (p.delayReason === "fiber") {
    const pend = p.status === "DELAYED";
    const dur = pend ? Math.max(0, elapsed - t) : Math.max(0, (p.settleAt ?? now) - p.t - t - ms.publish);
    add("Store-and-forward in the cabinet (fiber cut)", "gantry cabinet", dur, { pending: pend });
    if (pend) return { steps, total: t, pending: true };
  }
  add("Publish to mlff.trip.raw", "trip-ingest", ms.publish);

  if (p.method === "TAG") {
    add("Wait in mlff.charge.tag (batch)", "message broker", ms.batch);
    add("Axle classification and rating", "rating-service", ms.rating);
    const pend = p.status === "DELAYED" || p.status === "PROCESSING";
    const issuerDur = pend ? Math.max(0, elapsed - t) : ms.issuer;
    add(`Debit at issuer ${p.issuer?.name ?? ""}`.trim(), `tag-gateway → ${p.issuer?.name ?? "issuer"}`, issuerDur, { pending: pend });
    if (pend) return { steps, total: t, pending: true };
    add("Charge confirmation and record", "billing-service", ms.confirm);
    const total = t;
    add("Report to the toll authority", "authority-connector", ms.authority, { async: true });
    return { steps, total, pending: false };
  }

  if (p.method === "REVIEW" || p.method === "UNREAD") {
    const reviewPend = p.status === "IN_REVIEW";
    if (p.method === "REVIEW") {
      add("mlff.ocr.review queue + human review", "Operations center · reviewer", reviewPend ? Math.max(0, elapsed - t) : ms.review, {
        pending: reviewPend,
      });
    } else {
      add("mlff.ocr.review queue", "message broker", 1200);
    }
    if (reviewPend) return { steps, total: t, pending: true };
    if (p.method === "UNREAD" || p.reviewResult === "REVIEW_FAILED") {
      add("No valid read → potential evasion", "billing-service", 90, { level: "critical" });
      return { steps, total: t, pending: false };
    }
  }

  add("Axle classification and rating", "rating-service", ms.rating);
  const pend = p.status === "PROCESSING";
  const charge = p.autopay ? "Plate charge: account auto-pay" : "Registered for pay-by-plate (30 days)";
  add(charge, p.autopay ? "billing-service → payment gateway" : "billing-service", pend ? Math.max(0, elapsed - t) : p.autopay ? 4200 : 900, {
    pending: pend,
    level: "ok",
  });
  if (pend) return { steps, total: t, pending: true };
  const total = t;
  add("Report to the toll authority", "authority-connector", ms.authority, { async: true });
  return { steps, total, pending: false };
}
