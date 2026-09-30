import React, { useEffect, useRef } from "react";
import { DIR_CODE } from "../sim/model";
import { fmtClock } from "../sim/time";
import type { ChargeStatus, Passage } from "../sim/types";
import { LEVEL_COLOR, LEVEL_TEXT, METHOD_COLOR, METHOD_LEVEL, type Level } from "../theme/colors";
import { useApp, useSnapshot } from "../state/engine-context";
import { usePrefersReducedMotion } from "../state/use-reduced-motion";
import { fmtDec, fmtMoney } from "../format";
import { LevelIcon } from "./LevelIcon";
import { LicensePlate } from "./LicensePlate";
import { Panel } from "./Panel";

export function methodShort(p: Passage): string {
  const c = `${fmtDec(p.conf, 1)}%`;
  if (p.method === "TAG") return "Tag";
  if (p.method === "OCR") return `OCR ${c}`;
  if (p.method === "REVIEW") return `Review ${c}`;
  return "Unread";
}

export function chargeView(p: Passage): { text: string; level: Level; icon?: string } {
  const s: ChargeStatus = p.status;
  switch (s) {
    case "SETTLED": {
      const lat = p.settledAt ? `${fmtDec((p.settledAt - p.t) / 1000, 1)} s` : "";
      return { text: `Settled · ${p.issuer?.name ?? ""} · ${lat}`, level: "ok" };
    }
    case "AUTOPAY":
      return { text: "Account auto-pay", level: "ok" };
    case "AWAITING_PAYMENT":
      return { text: "Pay-by-plate · 30 days", level: "neutral", icon: "clock" };
    case "IN_REVIEW":
      return { text: "In human review", level: "warning" };
    case "DELAYED":
      return { text: p.delayReason === "fiber" ? "Delayed · store-and-forward" : "Settlement delayed · held", level: "warning", icon: "hourglass" };
    case "POTENTIAL_EVASION":
      return { text: "Potential evasion", level: "critical" };
    default:
      return { text: p.method === "TAG" ? `Sent to ${p.issuer?.name ?? "issuer"}` : "Processing", level: "neutral" };
  }
}

export const StatusPill = ({ level, text, icon }: { level: Level; text: string; icon?: string }) => (
  <span className="ff-pill" style={{ background: LEVEL_COLOR[level], color: LEVEL_TEXT[level] }}>
    <LevelIcon level={level} icon={icon} color={LEVEL_TEXT[level]} />
    {text}
  </span>
);

export const MethodPill = ({ p }: { p: Passage }) => {
  const level = METHOD_LEVEL[p.method];
  const dark = p.method === "OCR" || p.method === "REVIEW";
  return (
    <span className="ff-pill" style={{ background: METHOD_COLOR[p.method], color: dark ? "#1B1B1B" : "#FFFFFF" }}>
      <LevelIcon level={level} color={dark ? "#1B1B1B" : "#FFFFFF"} />
      {methodShort(p)}
    </span>
  );
};

/** Coins: every settled charge flies from its row to the revenue KPI. */
function useCoins() {
  const { engine } = useApp();
  const reduced = usePrefersReducedMotion();
  const active = useRef(0);
  const last = useRef(0);
  useEffect(
    () =>
      engine.on("settled", (p) => {
        if (reduced || (p.status !== "SETTLED" && p.status !== "AUTOPAY")) return;
        const now = performance.now();
        if (active.current >= 6 || now - last.current < 220) return;
        const row = document.querySelector(`[data-pid="${p.id}"]`);
        const target = document.getElementById("kpi-revenue");
        if (!row || !target) return;
        last.current = now;
        active.current++;
        const a = row.getBoundingClientRect();
        const b = target.getBoundingClientRect();
        const coin = document.createElement("div");
        coin.className = "ff-coin";
        coin.textContent = "$";
        coin.style.left = `${a.left + a.width * 0.72}px`;
        coin.style.top = `${a.top + a.height / 2 - 11}px`;
        document.body.appendChild(coin);
        requestAnimationFrame(() => {
          coin.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width * 0.72)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(0.7)`;
          coin.style.opacity = "0.2";
        });
        window.setTimeout(() => {
          coin.remove();
          active.current--;
          target.classList.remove("ff-pulse");
          void target.offsetWidth;
          target.classList.add("ff-pulse");
        }, 900);
      }),
    [engine, reduced],
  );
}

export const PassageFeed = () => {
  const snap = useSnapshot();
  const { prefs, select } = useApp();
  useCoins();
  return (
    <Panel
      title="Latest transactions"
      source="Transaction and charge Business Events (OpenPipeline, with plate masking at ingest)"
      right={<span className="ff-muted">{prefs.masked ? "plates masked" : "plates visible"}</span>}
      className="ff-feed"
    >
      <div className="ff-feed-list" role="list">
        {snap.feed.map((p) => {
          const c = chargeView(p);
          return (
            <button key={p.id} type="button" role="listitem" className="ff-feed-row" data-pid={p.id} onClick={() => select({ type: "passage", id: p.id })}>
              <span className="ff-feed-time">{fmtClock(p.t)}</span>
              <LicensePlate plate={p.plate} masked={prefs.masked} width={70} />
              <span className="ff-feed-lane">
                {DIR_CODE[p.dir]}·L{p.lane}
              </span>
              <span className="ff-feed-cat" title={p.cat.label}>
                Class {p.cat.cls} · {p.cat.axles}ax
              </span>
              <MethodPill p={p} />
              <span className="ff-feed-value">{fmtMoney(p.tariff)}</span>
              <StatusPill level={c.level} text={c.text} icon={c.icon} />
            </button>
          );
        })}
      </div>
    </Panel>
  );
};
