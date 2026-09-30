import type { Level, Method } from "../theme/colors";
import type { Category, Dir, Issuer, QueueId } from "./model";
import type { Plate } from "./plates";
import type { ScenarioId } from "./scenarios";

export type ChargeStatus = "PROCESSING" | "SETTLED" | "AUTOPAY" | "AWAITING_PAYMENT" | "IN_REVIEW" | "DELAYED" | "POTENTIAL_EVASION";

export interface Passage {
  id: string;
  traceId: string;
  /** Simulation time at which the vehicle crossed the gantry. */
  t: number;
  dir: Dir;
  /** 1–4. */
  lane: number;
  cat: Category;
  plate: Plate;
  hasTag: boolean;
  tagRead: boolean;
  issuer?: Issuer;
  method: Method;
  /** Outcome of human review, when applicable. */
  reviewResult?: "REVIEW_OK" | "REVIEW_FAILED";
  conf: number;
  tariff: number;
  status: ChargeStatus;
  autopay: boolean;
  settleAt?: number;
  settledAt?: number;
  reviewAt?: number;
  delayReason?: "issuer" | "fiber";
  condition: "day" | "night" | "fog" | "ir";
  laserOk: boolean;
  ms: {
    detect: number;
    ocr: number;
    publish: number;
    batch: number;
    rating: number;
    issuer: number;
    confirm: number;
    authority: number;
    review: number;
  };
}

export interface Vehicle {
  id: number;
  dir: Dir;
  /** 0–3. */
  lane: number;
  /** Distance travelled since entering the scene (scene units). */
  s: number;
  v: number;
  vDesired: number;
  len: number;
  wid: number;
  cat: Category;
  paint: string;
  cab: string;
  trailer: string;
  crossed: boolean;
  passage?: Passage;
  /** Real time (performance.now) of the crossing, for effects. */
  crossedReal?: number;
}

export interface KpiSet {
  health: number;
  txToday: number;
  revenueToday: number;
  settledToday: number;
  flowPerMin: number;
  flowPct: number;
  ident: number;
  conf: number;
  p95: number;
  unreadPerHour: number;
}

export type SparkKey = "health" | "flowPerMin" | "ident" | "conf" | "p95" | "unreadPerHour" | "revenue" | "tx";

export interface QueueView {
  id: QueueId;
  depth: number;
  waitMin: number;
  level: Level;
}

export interface PartnerView {
  id: string;
  name: string;
  p95: number;
  level: Level;
}

export interface InfraItem {
  id: string;
  label: string;
  value: string;
  level: Level;
}

export interface ProblemView {
  id: string;
  scenario?: ScenarioId;
  status: "Active" | "Forecast" | "Resolved" | "Informational";
  severity: "critical" | "warning" | "info";
  title: string;
  rootCause: string;
  action: string;
  explanation: string;
  start: string;
  duration: string;
  mttdMin?: number;
  entities: { id: string; label: string }[];
  impacts: { label: string; value: string; note?: string }[];
  accelerated: boolean;
}

export interface ScenarioState {
  id: ScenarioId;
  phase: "off" | "active" | "recovering";
  k: number;
}

export interface SessionStats {
  transactions: number;
  revenue: number;
  incidents: { name: string; mttdMin: number; impact: string }[];
  protected: number;
  risk: number;
  start: number;
}

export interface Snapshot {
  version: number;
  simTime: number;
  speed: number;
  paused: boolean;
  hour: number;
  night: boolean;
  visibility: number;
  inScene: number;
  kpi: KpiSet;
  kpiLevel: Record<"health" | "flow" | "ident" | "conf" | "p95" | "unread", Level>;
  spark: Record<SparkKey, number[]>;
  feed: Passage[];
  queues: QueueView[];
  partners: PartnerView[];
  nodes: Record<string, Level>;
  /** [dir][lane][equipment]. */
  equipment: Level[][][];
  infra: InfraItem[];
  problems: ProblemView[];
  scenarios: ScenarioState[];
  replayActive: boolean;
  session: SessionStats;
  highlight: string | null;
}

export interface EngineEvents {
  crossing: Passage;
  settled: Passage;
  reviewed: Passage;
  released: Passage;
}
