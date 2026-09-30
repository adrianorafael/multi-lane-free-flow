import type { QueueId } from "./model";

export type ScenarioId = "exodus" | "fog" | "ir" | "issuer" | "fiber" | "gpu";

export interface Impact {
  label: string;
  final: number;
  fmt: "int" | "money";
  /** Text shown at the end (e.g. "100% recovered"). */
  note?: string;
  /** Adds to the session summary as protected (delayed and recovered) or at-risk revenue. */
  summary?: "protected" | "risk";
}

export interface Entity {
  id: string;
  label: string;
}

export interface ScenarioDef {
  id: ScenarioId;
  key: string;
  name: string;
  summary: string;
  kind: "operation" | "incident";
  /** Scripted incident duration (incident minutes). */
  durationMin: number;
  /** Time to detection (incident minutes). */
  mttdMin: number;
  severity: "critical" | "warning";
  title: string;
  rootCause: string;
  action: string;
  explanation: string;
  entities: Entity[];
  impacts: Impact[];
  queues: Partial<Record<QueueId, number>>;
}

/** Replay factor: 1 real second = 100 incident seconds. */
export const REPLAY = 100;

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: "exodus",
    key: "1",
    name: "Holiday exodus",
    summary: "Holiday peak: light vehicles ×2.5 outbound",
    kind: "operation",
    durationMin: 0,
    mttdMin: 0,
    severity: "warning",
    title: "Holiday exodus: peak absorbed by the plaza",
    rootCause: "Outbound light-vehicle volume is ~2.5× the expected value for this hour (public holiday).",
    action: "No action needed: capture, OCR and queues are within limits.",
    explanation:
      "Outbound flow rose to about 250% of the expected value for this time of day. " +
      "Automatic identification, OCR confidence, time to charge and queues remain within their limits; " +
      "CPU on the edge data center hosts rose to 68%, with headroom. The plaza is absorbing the peak with no revenue risk.",
    entities: [
      { id: "lane:OUT", label: "Outbound direction" },
      { id: "node:ingest", label: "trip-ingest" },
      { id: "infra:cpu", label: "Edge data center" },
    ],
    impacts: [],
    queues: {},
  },
  {
    id: "fog",
    key: "2",
    name: "Mountain fog",
    summary: "Visibility below 80 m drops OCR confidence on every lane",
    kind: "incident",
    durationMin: 285,
    mttdMin: 6,
    severity: "critical",
    title: "Fog: OCR confidence dropped to ~80%",
    rootCause: "Visibility below 80 m at the km 42 weather station. All 8 lanes are equally affected: this is not an equipment failure.",
    action: "Reinforce the human review team and watch the mlff.ocr.review queue until visibility recovers.",
    explanation:
      "Average OCR confidence dropped from 98.5% to about 80% at the same time on all 8 lanes. " +
      "I correlated the drop with visibility at the km 42 weather station, which is below 80 m. " +
      "LPR cameras, IR illuminators and the OCR GPU are healthy. " +
      "More plate-only vehicles are going to human review and the mlff.ocr.review queue is growing. " +
      "Reinforce the review team; there is no need to dispatch field maintenance.",
    entities: [
      { id: "meteo", label: "Weather station km 42" },
      { id: "node:ocr", label: "ocr-engine" },
      { id: "node:q_review", label: "mlff.ocr.review" },
      { id: "lane:ALL", label: "8 of 8 lanes" },
    ],
    impacts: [
      { label: "Additional transactions in review", final: 7100, fmt: "int" },
      { label: "Additional revenue at risk", final: 7300, fmt: "money", summary: "risk" },
    ],
    queues: { "mlff.ocr.review": 3100 },
  },
  {
    id: "ir",
    key: "3",
    name: "IR illuminator failure · INB L3",
    summary: "Night: only inbound lane 3 loses night-time plate reads",
    kind: "incident",
    durationMin: 161,
    mttdMin: 4,
    severity: "critical",
    title: "Inbound lane 3: infrared illuminator failure",
    rootCause: "The INB L3 IR illuminator draws no current. The lane's front LPR reads plates at night with ~58% confidence; the other 7 lanes are normal.",
    action: "Dispatch a field crew with a replacement IR module to INB L3.",
    explanation:
      "Night-time reads from the INB L3 front LPR dropped to about 58% confidence, while the other 7 lanes stay above 97%. " +
      "The INB L3 IR illuminator stopped responding in the same minute the drop started. " +
      "Root cause: the INB L3 IR illuminator. Plate-only transactions on that lane are going to human review or remaining unread. " +
      "The field crew can leave with the right part.",
    entities: [
      { id: "equip:INB-3-2", label: "IR illuminator · INB L3" },
      { id: "equip:INB-3-0", label: "Front LPR · INB L3" },
      { id: "lane:INB-3", label: "INB L3" },
    ],
    impacts: [
      { label: "Transactions without an automatic read", final: 1480, fmt: "int" },
      { label: "Revenue at risk", final: 2800, fmt: "money", summary: "risk" },
    ],
    queues: { "mlff.ocr.review": 2600 },
  },
  {
    id: "issuer",
    key: "4",
    name: "Tag issuer timeouts · BetaPass",
    summary: "Slow debit API: circuit breaker opens and tag revenue is held",
    kind: "incident",
    durationMin: 171,
    mttdMin: 3,
    severity: "critical",
    title: "Timeouts on the BetaPass debit API",
    rootCause: "BetaPass debit API p95 at 11.4 s → tag-gateway circuit breaker open → messages held in mlff.charge.tag.",
    action: "Contact the BetaPass issuer. Reprocessing is automatic once the circuit breaker closes.",
    explanation:
      "The p95 latency of the BetaPass debit API rose from 210 ms to 11.4 s. " +
      "The tag-gateway opened its circuit breaker and BetaPass tag transactions (25% of all tag transactions) are held in the mlff.charge.tag queue, with part of them going to the dead-letter queue. " +
      "The other issuers are normal. Revenue is delayed, not lost: once the issuer recovers, messages are reprocessed automatically.",
    entities: [
      { id: "node:betapass", label: "BetaPass issuer" },
      { id: "node:taggw", label: "tag-gateway" },
      { id: "node:q_tag", label: "mlff.charge.tag" },
    ],
    impacts: [
      { label: "Messages held (reprocessed)", final: 17000, fmt: "int" },
      { label: "Revenue with delayed settlement", final: 29600, fmt: "money", note: "100% recovered", summary: "protected" },
    ],
    queues: { "mlff.charge.tag": 17000, "mlff.dlq": 4000 },
  },
  {
    id: "fiber",
    key: "5",
    name: "Fiber cut gantry → edge DC",
    summary: "Backup radio takes over; store-and-forward keeps transactions in the cabinet",
    kind: "incident",
    durationMin: 95,
    mttdMin: 1,
    severity: "warning",
    title: "Gantry → edge data center fiber link down",
    rootCause: "10G fiber cut. Failover to the km 33 radio: only metadata flows; images stay in the cabinet buffer (store-and-forward).",
    action: "Dispatch the network team to repair the fiber. No transaction was lost.",
    explanation:
      "The 10G fiber link between the gantry and the edge data center went down. The km 33 backup radio took over within seconds, with limited bandwidth: " +
      "metadata keeps flowing and images are stored in the gantry cabinet (store-and-forward). " +
      "No transaction was lost; settlement is delayed by up to 38 minutes and will catch up when the fiber is back.",
    entities: [
      { id: "fiber", label: "10G fiber link" },
      { id: "radio", label: "Backup radio km 33" },
      { id: "node:cabinet", label: "Gantry cabinet" },
    ],
    impacts: [
      { label: "Transactions buffered (store-and-forward)", final: 5200, fmt: "int" },
      { label: "Revenue with delayed settlement", final: 42000, fmt: "money", note: "$0 lost", summary: "protected" },
    ],
    queues: { "mlff.trip.raw": 9000 },
  },
  {
    id: "gpu",
    key: "6",
    name: "OCR GPU throttling",
    summary: "The overheating forecast comes true: OCR slows down",
    kind: "incident",
    durationMin: 120,
    mttdMin: 2,
    severity: "warning",
    title: "Thermal throttling on the OCR GPU (gpu-ocr-edge-01)",
    rootCause: "GPU at 86 °C: the 85 °C limit forecast 2 days ago was reached. OCR became 3× slower and some reads time out and go to review.",
    action: "Clean the rack air filters and shift load to the standby GPU.",
    explanation:
      "The gpu-ocr-edge-01 temperature reached 86 °C and the GPU lowered its clock to protect itself. " +
      "OCR latency tripled and some reads time out, going to human review. " +
      "This was forecast 2 days ago from the temperature trend: preventive action would have avoided the impact.",
    entities: [
      { id: "gpu", label: "gpu-ocr-edge-01" },
      { id: "node:ocr", label: "ocr-engine" },
      { id: "node:q_review", label: "mlff.ocr.review" },
    ],
    impacts: [
      { label: "Additional transactions in review", final: 1900, fmt: "int" },
      { label: "Revenue at risk", final: 1900, fmt: "money", summary: "risk" },
    ],
    queues: { "mlff.ocr.review": 1900 },
  },
];

export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s])) as Record<ScenarioId, ScenarioDef>;

export const GPU_FORECAST = {
  title: "OCR GPU heating up: throttling forecast in ~2 days",
  rootCause: "gpu-ocr-edge-01 temperature rising for 36 h (71 °C today) after an increase in image reprocessing. Throttling limit: 85 °C.",
  action: "Schedule a rack filter cleaning before the next holiday peak.",
  explanation:
    "The gpu-ocr-edge-01 temperature has been rising steadily for 36 hours and is at 71 °C today. " +
    "If the trend continues, the GPU reaches its 85 °C thermal throttling limit in about 2 days. " +
    "If that happens during a peak, OCR slows down and the human review queue grows. This is why plaza health is at 94.",
  entities: [
    { id: "gpu", label: "gpu-ocr-edge-01" },
    { id: "node:ocr", label: "ocr-engine" },
  ],
};
