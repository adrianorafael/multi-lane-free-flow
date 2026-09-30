import React from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { PageLayout } from "@dynatrace/strato-components/layouts";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { openDocument } from "@dynatrace-sdk/navigation";
import { journey } from "../sim/journey";
import { DIR_CODE, DIR_NAME, EQUIP, LIMITS } from "../sim/model";
import { fmtClockMs } from "../sim/time";
import type { Passage, Snapshot } from "../sim/types";
import { BRAND, LEVEL_COLOR, METHOD_LABEL, type Level } from "../theme/colors";
import { useApp, useSnapshot, type Selection } from "../state/engine-context";
import { fmtDec, fmtInt, fmtMoney, fmtMs } from "../format";
import { Sparkline } from "./KpiRibbon";
import { LicensePlate } from "./LicensePlate";
import { NODES } from "./PipelineFlow";
import { chargeView, MethodPill, StatusPill } from "./PassageFeed";

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="ff-kv">
    <span>{k}</span>
    <span>{v}</span>
  </div>
);

const DashboardLink = ({ id }: { id: string }) =>
  id ? (
    <Button variant="emphasized" onClick={() => openDocument(id)}>
      Open dashboard
    </Button>
  ) : null;

const levelText = (l: Level) => (l === "ok" ? "Healthy" : l === "warning" ? "Warning" : l === "critical" ? "Critical" : "Neutral");

const Journey = ({ p, snap }: { p: Passage; snap: Snapshot }) => {
  const { prefs } = useApp();
  const j = journey(p, snap.simTime);
  const span = Math.max(1, ...j.steps.map((s) => s.start + s.dur));
  const c = chargeView(p);
  return (
    <>
      <div className="ff-det-head">
        <LicensePlate plate={p.plate} masked={prefs.masked} width={170} />
        <div>
          <Heading level={5}>Transaction journey</Heading>
          <Text className="ff-muted">
            {DIR_NAME[p.dir]} · Lane {p.lane} · {fmtClockMs(p.t)}
          </Text>
        </div>
      </div>
      <div className="ff-det-chips">
        <MethodPill p={p} />
        <StatusPill level={c.level} text={c.text} icon={c.icon} />
      </div>
      <div className="ff-total">
        {j.pending ? (
          <>
            In progress for <b>{fmtMs(j.total)}</b>
          </>
        ) : (
          <>
            Road to revenue in <b>{fmtMs(j.total)}</b>
          </>
        )}
      </div>
      <div className="ff-wf" role="table" aria-label="Transaction steps">
        {j.steps.map((s, i) => (
          <div key={i} className="ff-wf-row" role="row">
            <div className="ff-wf-name" role="cell">
              <span>{s.name}</span>
              <small>{s.component}</small>
            </div>
            <div className="ff-wf-track" role="cell">
              <div
                className={`ff-wf-bar ${s.pending ? "ff-wf-pend" : ""}`}
                style={{
                  left: `${(s.start / span) * 100}%`,
                  width: `${Math.max(0.8, (s.dur / span) * 100)}%`,
                  background: s.async ? BRAND.teal : LEVEL_COLOR[s.level],
                }}
              />
            </div>
            <div className="ff-wf-dur" role="cell">
              {fmtMs(s.dur)}
              {s.async ? " (async)" : ""}
            </div>
          </div>
        ))}
      </div>
      <div className="ff-kvs">
        <Row k="transaction.id" v={<code>{p.id}</code>} />
        <Row k="trace_id" v={<code>{p.traceId.slice(0, 16)}…</code>} />
        <Row k="Vehicle class" v={`${p.cat.label} · ${p.cat.axles} axles`} />
        <Row k="Laser classification" v={p.laserOk ? "Matches the class" : "Mismatch (checked against tag/OCR)"} />
        <Row k="Method" v={`${METHOD_LABEL[p.method]}${p.reviewResult === "REVIEW_OK" ? " → identified in review" : ""}`} />
        <Row k="Tag" v={p.hasTag ? `${p.issuer?.name ?? ""} · ${p.tagRead ? "read" : "not read by the reader"}` : "no tag"} />
        <Row k="OCR confidence" v={`${fmtDec(p.conf, 1)}%`} />
        <Row k="Tariff" v={fmtMoney(p.tariff)} />
      </div>
      <div className="ff-det-actions">
        <DashboardLink id={prefs.dashboardId} />
        <Tooltip text="Available with real data (distributed trace of the transaction)">
          <span>
            <Button disabled>View trace in Dynatrace</Button>
          </span>
        </Tooltip>
      </div>
    </>
  );
};

const KPI_INFO: Record<string, { title: string; text: string; limits?: string }> = {
  health: {
    title: "Plaza health (0–100)",
    text: "Composite index: automatic identification (30%), OCR confidence (15%), p95 to charge (15%), queues (15%), partners (10%) and equipment / infrastructure (15%).",
    limits: `Green ≥ ${LIMITS.health[0]} · yellow ≥ ${LIMITS.health[1]} · red below`,
  },
  tx: { title: "Transactions today", text: "Vehicles detected by the gantry since local midnight. The series shows transactions per minute." },
  revenue: { title: "Revenue billed today", text: "Tariff of identified transactions (tag, OCR and review). Settled = debit confirmed by the tag issuer or account auto-pay." },
  flowPerMin: { title: "Flow now", text: "Vehicles per minute over the last minute, compared with the expected value for this time of day.", limits: "Green ≥ 90% · yellow ≥ 75%" },
  ident: { title: "Automatic identification", text: "Transactions identified with no human intervention (tag + automatic OCR).", limits: "Green ≥ 97% · yellow ≥ 95%" },
  conf: { title: "OCR confidence", text: "Mean confidence of the ocr-engine plate reads.", limits: "Green ≥ 95% · yellow ≥ 90%" },
  p95: { title: "Passage → charge (p95)", text: "Time between the gantry passage and the issuer's debit confirmation (95th percentile, tag transactions).", limits: "Green ≤ 30 s · yellow ≤ 120 s" },
  unreadPerHour: {
    title: "Revenue without automatic ID",
    text: "Hourly rate of revenue that depends on human review or has no valid read.",
    limits: `This is lost or at-risk revenue, so it is never green: neutral below $${fmtInt(LIMITS.unreadRevenue[0])} · yellow below $${fmtInt(LIMITS.unreadRevenue[1])} · red above`,
  },
};

const NODE_SOURCE: Record<string, string> = {
  queue: "Message broker extension (depth, consumer lag) + messaging tracing",
  partner: "Traces of outbound calls (tag-gateway / billing-service) + Synthetic HTTP monitors",
  svc: "OneAgent / OpenTelemetry: response time, failures and throughput of the service",
};

function Body({ sel, snap }: { sel: Selection; snap: Snapshot }) {
  const { engine, prefs } = useApp();
  if (sel.type === "passage") {
    const p = engine.getPassage(sel.id);
    if (!p) return <Text>This transaction is no longer in the recent history.</Text>;
    return <Journey p={p} snap={snap} />;
  }
  if (sel.type === "kpi") {
    const info = KPI_INFO[sel.key];
    const data = snap.spark[sel.key as keyof Snapshot["spark"]] ?? [];
    return (
      <>
        <Heading level={5}>{info?.title}</Heading>
        <Text>{info?.text}</Text>
        {info?.limits && <Text className="ff-muted">{info.limits}</Text>}
        <div className="ff-det-spark">
          <Sparkline data={data} color={BRAND.teal} width={320} height={80} />
          <small className="ff-muted">last 60 minutes (simulation)</small>
        </div>
        <DashboardLink id={prefs.dashboardId} />
      </>
    );
  }
  if (sel.type === "node") {
    const n = NODES[sel.id];
    const lvl: Level = snap.nodes[sel.id] ?? "ok";
    const q = n?.queue ? snap.queues.find((x) => x.id === n.queue) : undefined;
    const partner = snap.partners.find((x) => x.id === sel.id);
    const related = snap.problems.filter((p) => p.entities.some((e) => e.id === `node:${sel.id}`));
    return (
      <>
        <Heading level={5}>{n?.queue ?? partner?.name ?? `${n?.label ?? sel.id}${n?.sub ?? ""}`}</Heading>
        <StatusPill level={lvl} text={levelText(lvl)} />
        <div className="ff-kvs">
          {q && <Row k="Depth" v={`${fmtInt(q.depth)} messages`} />}
          {q && q.waitMin >= 1 && <Row k="Estimated wait" v={`${fmtInt(q.waitMin)} min`} />}
          {partner && <Row k="Latency p95" v={fmtMs(partner.p95)} />}
          {partner && <Row k="Thresholds" v="warning ≥ 1.5 s · critical ≥ 5 s" />}
        </div>
        {related.map((p) => (
          <Text key={p.id}>
            <b>Related problem:</b> {p.title} ({p.status})
          </Text>
        ))}
        <Text className="ff-muted">In real life: {NODE_SOURCE[n?.kind ?? "svc"]}</Text>
      </>
    );
  }
  if (sel.type === "equip") {
    const lvl = snap.equipment[sel.dir][sel.lane][sel.equip];
    const irFail = sel.dir === 0 && sel.lane === 2 && lvl !== "ok";
    return (
      <>
        <Heading level={5}>
          {EQUIP[sel.equip]} · {DIR_CODE[sel.dir]} L{sel.lane + 1}
        </Heading>
        <StatusPill level={lvl} text={levelText(lvl)} />
        <div className="ff-kvs">
          {sel.equip <= 1 && <Row k="Frames per second" v="30 fps" />}
          {sel.equip <= 1 && <Row k="Mean confidence (lane)" v={irFail && snap.night ? "58%" : "98.4%"} />}
          {sel.equip === 2 && <Row k="IR module current" v={lvl === "critical" ? "0.0 A (no current)" : "1.8 A"} />}
          {sel.equip === 3 && <Row k="Tag read rate" v={sel.dir === 0 && sel.lane === 2 ? "99.58%" : "99.74%"} />}
          {sel.equip === 4 && <Row k="Classification agreement" v={sel.dir === 1 && sel.lane === 3 ? "99.31% (target ≥ 99.5%)" : "99.83%"} />}
        </div>
        <Text className="ff-muted">In real life: Extensions (SNMP / gantry vendor API) + lane controller logs.</Text>
      </>
    );
  }
  const item = snap.infra.find((i) => i.id === sel.id);
  return (
    <>
      <Heading level={5}>{item?.label ?? sel.id}</Heading>
      {item && <StatusPill level={item.level} text={item.value} />}
      <Text className="ff-muted">In real life: OneAgent on the edge data center hosts and Extensions for UPS, storage, network and cabinet sensors.</Text>
    </>
  );
}

export const DetailsPanel = () => {
  const { selection, select } = useApp();
  const snap = useSnapshot();
  return (
    <PageLayout.Details collapsed={!selection} onCollapsedChange={(c) => c && select(null)} defaultLayout="overlay" defaultWidth="34%" minWidth={420}>
      <PageLayout.Details.ControlBar />
      <div className="ff-details">{selection && <Body sel={selection} snap={snap} />}</div>
    </PageLayout.Details>
  );
};
