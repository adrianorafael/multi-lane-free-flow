import { levelFor, PAINT, TRAILER, TRUCK_CAB, type Level, type Method } from "../theme/colors";
import {
  avgMult,
  CATEGORIES,
  DIR_CODE,
  heavyRate,
  ISSUERS,
  LANE_SHARE,
  lightRate,
  OTHER_PARTNERS,
  P_AUTOPAY,
  P_TAG,
  QUEUE_CRIT,
  QUEUE_WARN,
  QUEUES,
  TARIFF_CLASS1,
  type Category,
  type Dir,
  type QueueId,
  type VehicleClass,
} from "./model";
import { makePlate } from "./plates";
import { Rng } from "./rng";
import { GPU_FORECAST, REPLAY, SCENARIO_BY_ID, SCENARIOS, type ScenarioDef, type ScenarioId } from "./scenarios";
import { clockParts, fmtClock, fmtDuration, isNight } from "./time";
import type {
  EngineEvents,
  InfraItem,
  KpiSet,
  Passage,
  PartnerView,
  ProblemView,
  QueueView,
  SessionStats,
  Snapshot,
  SparkKey,
  Vehicle,
} from "./types";

// ---------------------------------------------------------------- scene geometry
export const SCENE_W = 1600;
export const SCENE_H = 560;
export const GANTRY_X = 800;
const ENTRY = 70;
const S_CROSS = GANTRY_X + ENTRY;
const S_EXIT = SCENE_W + 2 * ENTRY + 140;
const KMH = 1.55; // scene units per km/h
const STEP_MS = 50;
const SPARK_LEN = 60;
export const DEFAULT_SEED = 20260929;

export function vehicleX(v: Vehicle): number {
  return v.dir === 1 ? v.s - ENTRY : SCENE_W + ENTRY - v.s;
}

// ---------------------------------------------------------------- statistical model
const CLASSES: readonly VehicleClass[] = ["light", "heavy"];
const CATS: Record<VehicleClass, Category[]> = {
  light: CATEGORIES.filter((c) => c.vclass === "light"),
  heavy: CATEGORIES.filter((c) => c.vclass === "heavy"),
};
const AVG_TARIFF: Record<VehicleClass, number> = {
  light: TARIFF_CLASS1 * avgMult("light"),
  heavy: TARIFF_CLASS1 * avgMult("heavy"),
};
const QUEUE_CAPACITY_MIN: Record<QueueId, number> = {
  "mlff.trip.raw": 400,
  "mlff.ocr.review": 60,
  "mlff.charge.tag": 120,
  "mlff.charge.plate": 100,
  "mlff.dlq": 50,
};

function tagReadRate(dir: Dir, lane0: number): number {
  return dir === 0 && lane0 === 2 ? 0.9958 : 0.9974;
}

export function confMu(night: boolean, fogK: number, irK: number): number {
  return 98.5 - (night ? 0.9 : 0) - fogK * 16 - irK * 38.9;
}

export function confSd(fogK: number, irK: number): number {
  return Math.sqrt(1.2 ** 2 + (fogK * 14) ** 2 + (irK * 3) ** 2);
}

/** Φ (standard normal CDF). */
export function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Loss metrics are never shown as "good": below the warning threshold they are neutral. */
const lossLevel = (l: Level): Level => (l === "ok" ? "neutral" : l);
const clamp01 = (v: number) => clamp(v, 0, 1);

export interface HealthInputs {
  ident: number;
  conf: number;
  p95: number;
  maxQueue: number;
  maxPartnerMs: number;
  warn: number;
  crit: number;
}

/**
 * Plaza health index (0–100). Weights: identification 30%, OCR confidence 15%, p95 to charge 15%,
 * queues 15%, partners 10%, equipment and infrastructure 15%.
 */
export function healthIndex(i: HealthInputs): number {
  const sIdent = clamp01((i.ident - 65) / (98.8 - 65));
  const sConf = clamp01((i.conf - 60) / (98 - 60));
  const sP95 = clamp01((3600 - i.p95) / (3600 - 15));
  const sQueue = clamp01(1 - i.maxQueue / 60000);
  const sPartner = clamp01((20000 - i.maxPartnerMs) / (20000 - 1500));
  const sInfra = clamp01((100 - 12 * i.warn - 20 * i.crit) / 100);
  return 100 * (0.3 * sIdent + 0.15 * sConf + 0.15 * sP95 + 0.15 * sQueue + 0.1 * sPartner + 0.15 * sInfra);
}

// ---------------------------------------------------------------- scenario runs
interface Run {
  def: ScenarioDef;
  phase: "active" | "recovering";
  k: number;
  incidentMin: number;
  recoveryReal: number;
  recoveryTotal: number;
  startedSim: number;
  opened: boolean;
  peakP: number;
}

interface ResolvedProblem {
  def: ScenarioDef;
  startedSim: number;
  durMin: number;
  peakP: number;
}

type Handler<K extends keyof EngineEvents> = (e: EngineEvents[K]) => void;

interface Targets {
  ident: number;
  conf: number;
  p95: number;
  unreadPerHour: number;
  expectedPerMin: number;
}

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export class Engine {
  seed = DEFAULT_SEED;
  simTime = Date.now();
  speed = 1;
  paused = false;
  /** [dir][lane] → vehicle queue (leader first). */
  lanes: Vehicle[][][] = [];

  private rng = new Rng(DEFAULT_SEED);
  private vid = 1;
  private nextArr: number[][] = [];
  private pending: number[][] = [];
  private passages: Passage[] = [];
  private settleList: Passage[] = [];
  private reviewList: Passage[] = [];
  private delayed: Passage[] = [];
  private acc = 0;
  private realNow = 0;
  private day = { start: 0, tx: 0, revenue: 0, settled: 0 };
  private crossTimes: number[] = [];
  private flowWindowStart = 0;
  private kpi!: KpiSet;
  private spark!: Record<SparkKey, number[]>;
  private sparkMinute = 0;
  private minuteCount = 0;
  private minuteRevenue = 0;
  private runs = new Map<ScenarioId, Run>();
  private resolved: ResolvedProblem[] = [];
  private session!: SessionStats;
  private highlightId: string | null = null;
  private highlightUntil = 0;
  private irRestore = false;
  private gpuBase = 71;
  private listeners: { [K in keyof EngineEvents]: Set<Handler<K>> } = {
    crossing: new Set(),
    settled: new Set(),
    reviewed: new Set(),
    released: new Set(),
  };
  private snap!: Snapshot;
  private version = 0;
  private lastSnapReal = -1e9;
  private snapListeners = new Set<() => void>();

  constructor(seed = DEFAULT_SEED) {
    this.reset(seed);
  }

  // ------------------------------------------------------------ public API
  reset(seed = this.seed): void {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.vid = 1;
    this.lanes = [0, 1].map(() => [0, 1, 2, 3].map(() => [] as Vehicle[]));
    this.pending = [0, 1].map(() => [0, 0, 0, 0]);
    this.passages = [];
    this.settleList = [];
    this.reviewList = [];
    this.delayed = [];
    this.runs.clear();
    this.resolved = [];
    this.irRestore = false;
    this.session = { transactions: 0, revenue: 0, incidents: [], protected: 0, risk: 0, start: Date.now() };
    this.jumpTo(Date.now());
    this.forceSnapshot();
  }

  on<K extends keyof EngineEvents>(evt: K, fn: Handler<K>): () => void {
    this.listeners[evt].add(fn);
    return () => this.listeners[evt].delete(fn);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.snapListeners.add(fn);
    return () => this.snapListeners.delete(fn);
  };

  getSnapshot = (): Snapshot => this.snap;

  setSpeed(s: number): void {
    this.speed = s;
    this.forceSnapshot();
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.forceSnapshot();
  }

  /** Simulated hour (0–24), or null for "now" (real local time). */
  setHour(h: number | null): void {
    if (h === null) this.jumpTo(Date.now());
    else this.jumpTo(clockParts(this.simTime).dayStart + h * 3600_000);
    this.forceSnapshot();
  }

  /** Pins the simulation clock to an absolute instant (tests and rehearsals). */
  setSimTime(ms: number): void {
    this.jumpTo(ms);
    this.forceSnapshot();
  }

  toggleScenario(id: ScenarioId): void {
    const run = this.runs.get(id);
    if (!run) this.startRun(id);
    else if (run.phase === "active") this.endRun(run);
    this.forceSnapshot();
  }

  /** Ends every active incident (key 0). */
  normalize(): void {
    for (const run of this.runs.values()) if (run.phase === "active") this.endRun(run);
    this.forceSnapshot();
  }

  highlight(id: string): void {
    this.highlightId = id;
    this.highlightUntil = this.realNow + 6000;
    this.forceSnapshot();
  }

  getHighlight(): string | null {
    return this.realNow < this.highlightUntil ? this.highlightId : null;
  }

  getPassage(id: string): Passage | undefined {
    return this.passages.find((p) => p.id === id);
  }

  scenarioK(id: ScenarioId): number {
    return this.runs.get(id)?.k ?? 0;
  }

  // ------------------------------------------------------------ main loop
  tick(now: number): void {
    const gap = this.realNow === 0 ? 16 : now - this.realNow;
    this.realNow = now;
    if (!this.paused) {
      if (gap > 1500) {
        // hidden tab: update aggregates only, never dump hundreds of vehicles at once
        this.simTime += gap * this.speed;
        this.recomputeDay();
        this.resetFlow();
        this.resetArrivals();
      } else {
        this.acc += gap * this.speed;
        let steps = 0;
        while (this.acc >= STEP_MS && steps < 80) {
          this.step(STEP_MS);
          this.acc -= STEP_MS;
          steps++;
        }
        if (steps >= 80) this.acc = 0;
      }
      this.advanceRuns(Math.min(gap, 1500));
      this.smooth(Math.min(gap, 1500));
      this.recordSpark();
    }
    if (now - this.lastSnapReal >= 250) this.forceSnapshot();
  }

  private step(dt: number): void {
    this.simTime += dt;
    const { hour, dow, dayStart } = clockParts(this.simTime);
    if (dayStart !== this.day.start) this.recomputeDay();
    const rates = this.laneRates(hour, dow);
    const dts = dt / 1000;
    const slow = 1 - 0.25 * this.scenarioK("fog");

    for (let d = 0; d < 2; d++) {
      for (let l = 0; l < 4; l++) {
        const r = rates[d][l];
        const lam = r.light + r.heavy;
        if (lam <= 0) {
          this.nextArr[d][l] = this.simTime + 1000;
        } else {
          while (this.nextArr[d][l] <= this.simTime) {
            this.pending[d][l] = Math.min(this.pending[d][l] + 1, 20);
            this.nextArr[d][l] += this.rng.expo(lam) * 1000;
          }
        }
        const lane = this.lanes[d][l];
        if (this.pending[d][l] > 0) {
          const last = lane[lane.length - 1];
          if (!last || last.s - last.len > 26) {
            lane.push(this.spawn(d as Dir, l, lam > 0 ? r.heavy / lam : 0));
            this.pending[d][l]--;
          }
        }
        for (let i = 0; i < lane.length; i++) {
          const v = lane[i];
          let target = v.vDesired * slow;
          if (i > 0) {
            const lead = lane[i - 1];
            const gap = lead.s - lead.len - v.s;
            if (gap < 34) target = Math.min(target, lead.v * (gap < 14 ? 0.8 : 1));
          }
          const dv = clamp(target - v.v, -140 * dts, 45 * dts);
          v.v = Math.max(0, v.v + dv);
          v.s += v.v * dts;
          if (!v.crossed && v.s >= S_CROSS) this.cross(v);
        }
        while (lane.length && lane[0].s - lane[0].len > S_EXIT) lane.shift();
      }
    }

    if (this.settleList.length) {
      const keep: Passage[] = [];
      for (const p of this.settleList) {
        if (p.settleAt !== undefined && this.simTime >= p.settleAt) this.settle(p);
        else keep.push(p);
      }
      this.settleList = keep;
    }
    if (this.reviewList.length) {
      const keep: Passage[] = [];
      for (const p of this.reviewList) {
        if (p.reviewAt !== undefined && this.simTime >= p.reviewAt) this.review(p);
        else keep.push(p);
      }
      this.reviewList = keep;
    }
    const cut = this.simTime - 120_000;
    while (this.crossTimes.length && this.crossTimes[0] < cut) this.crossTimes.shift();
  }

  // ------------------------------------------------------------ traffic
  private laneRates(hour: number, dow: number): { light: number; heavy: number }[][] {
    const exodus = this.scenarioK("exodus");
    const L = lightRate(hour, dow) / 3600 / 2;
    const H = heavyRate(hour, dow) / 3600 / 2;
    const dirL = [L * (1 - 0.2 * exodus), L * (1 + 1.5 * exodus)];
    return [0, 1].map((d) =>
      [0, 1, 2, 3].map((l) => ({ light: dirL[d] * LANE_SHARE.light[l], heavy: H * LANE_SHARE.heavy[l] })),
    );
  }

  private spawn(dir: Dir, lane: number, pHeavy: number): Vehicle {
    const rng = this.rng;
    const vclass: VehicleClass = rng.next() < pHeavy ? "heavy" : "light";
    const cat = rng.pick(CATS[vclass], (c) => c.share);
    let len = 44;
    let wid = 20;
    let kmh = rng.range(95, 115);
    switch (cat.kind) {
      case "moto":
        len = 22;
        wid = 9;
        kmh = rng.range(100, 120);
        break;
      case "carTrailer":
        len = cat.axles === 3 ? 66 : 76;
        kmh = rng.range(85, 100);
        break;
      case "bus":
        len = 88;
        wid = 25;
        kmh = rng.range(80, 95);
        break;
      case "truck":
        len = 58 + (cat.axles - 2) * 14;
        wid = 25;
        kmh = rng.range(68, 85);
        break;
      default:
        break;
    }
    const vDesired = kmh * KMH;
    return {
      id: this.vid++,
      dir,
      lane,
      s: 0,
      v: vDesired * 0.95,
      vDesired,
      len,
      wid,
      cat,
      paint: rng.choice(PAINT),
      cab: rng.choice(TRUCK_CAB),
      trailer: rng.choice(TRAILER),
      crossed: false,
    };
  }

  private isActive(id: ScenarioId): boolean {
    const r = this.runs.get(id);
    return !!r && r.phase === "active" && r.k > 0.5;
  }

  private cross(v: Vehicle): void {
    const rng = this.rng;
    const t = this.simTime;
    const { hour } = clockParts(t);
    const night = isNight(hour);
    const fogK = this.scenarioK("fog");
    const irK = v.dir === 0 && v.lane === 2 ? this.scenarioK("ir") : 0;
    const gpuK = this.scenarioK("gpu");
    const vclass = v.cat.vclass;
    const hasTag = rng.next() < P_TAG[vclass];
    const tagRead = hasTag && rng.next() < tagReadRate(v.dir, v.lane);
    const conf = clamp(confMu(night, fogK, irK) + confSd(fogK, irK) * rng.normal(), 40, 99.9);

    let method: Method;
    if (tagRead) method = "TAG";
    else {
      const u = rng.next();
      if (u < 0.015) method = "UNREAD";
      else if (u < 0.07) method = "REVIEW";
      else if (conf >= 90 && rng.next() >= gpuK * 0.2) method = "OCR";
      else method = rng.next() < 0.85 ? "REVIEW" : "UNREAD";
    }
    const issuer = hasTag ? rng.pick(ISSUERS, (o) => o.share) : undefined;
    const lane = v.lane + 1;
    const laserOk = rng.next() < (v.dir === 1 && lane === 4 ? 0.9931 : 0.9983);
    const tariff = Math.round(TARIFF_CLASS1 * v.cat.mult * 100) / 100;
    const ms = {
      detect: rng.range(8, 16),
      ocr: rng.range(140, 220) * (1 + 2 * gpuK),
      publish: rng.range(30, 50),
      batch: rng.range(3000, 11500),
      rating: rng.range(50, 80),
      issuer: issuer ? issuer.p95 * (0.35 + 0.65 * rng.next()) : 0,
      confirm: rng.range(120, 160),
      authority: rng.range(400, 560),
      review: 0,
    };
    const d = new Date(t);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
    let trace = "";
    for (let i = 0; i < 4; i++) trace += Math.floor(rng.next() * 0xffffffff).toString(16).padStart(8, "0");
    const p: Passage = {
      id: `G05-${stamp}-${DIR_CODE[v.dir]}${lane}-${v.id}`,
      traceId: trace,
      t,
      dir: v.dir,
      lane,
      cat: v.cat,
      plate: makePlate(rng, vclass === "heavy"),
      hasTag,
      tagRead,
      issuer,
      method,
      conf,
      tariff,
      status: "PROCESSING",
      autopay: false,
      condition: irK > 0.5 ? "ir" : fogK > 0.5 ? "fog" : night ? "night" : "day",
      laserOk,
      ms,
    };

    const fiber = this.isActive("fiber");
    if (method === "TAG") {
      this.day.revenue += tariff;
      if (fiber) this.delay(p, "fiber");
      else if (issuer?.id === "betapass" && this.isActive("issuer")) this.delay(p, "issuer");
      else {
        p.settleAt = t + ms.detect + ms.ocr + ms.publish + ms.batch + ms.rating + ms.issuer + ms.confirm;
        this.settleList.push(p);
      }
    } else if (method === "OCR") {
      this.day.revenue += tariff;
      p.autopay = rng.next() < P_AUTOPAY;
      if (fiber) this.delay(p, "fiber");
      else {
        p.settleAt = t + (p.autopay ? rng.range(3000, 8000) : 1500);
        this.settleList.push(p);
      }
    } else if (method === "REVIEW") {
      p.status = "IN_REVIEW";
      ms.review = rng.range(40, 180) * 1000 * (1 + 2 * fogK);
      p.reviewAt = t + ms.review;
      this.reviewList.push(p);
    } else {
      p.status = "POTENTIAL_EVASION";
    }

    this.passages.push(p);
    if (this.passages.length > 400) this.passages.shift();
    this.day.tx++;
    this.session.transactions++;
    if (method !== "UNREAD") this.session.revenue += tariff;
    this.minuteCount++;
    this.minuteRevenue += method === "UNREAD" ? 0 : tariff;
    this.crossTimes.push(t);
    v.crossed = true;
    v.passage = p;
    v.crossedReal = this.realNow;
    this.emit("crossing", p);
  }

  private delay(p: Passage, reason: "issuer" | "fiber"): void {
    p.status = "DELAYED";
    p.delayReason = reason;
    this.delayed.push(p);
  }

  private settle(p: Passage): void {
    if (p.method === "TAG") {
      p.status = "SETTLED";
      this.day.settled += p.tariff;
    } else if (p.autopay) {
      p.status = "AUTOPAY";
      this.day.settled += p.tariff;
    } else {
      p.status = "AWAITING_PAYMENT";
    }
    p.settledAt = this.simTime;
    this.emit("settled", p);
  }

  private review(p: Passage): void {
    if (this.rng.next() < 0.97) {
      p.reviewResult = "REVIEW_OK";
      this.day.revenue += p.tariff;
      p.autopay = this.rng.next() < P_AUTOPAY;
      p.status = "PROCESSING";
      p.settleAt = this.simTime + (p.autopay ? this.rng.range(3000, 8000) : 1500);
      this.settleList.push(p);
    } else {
      p.reviewResult = "REVIEW_FAILED";
      p.status = "POTENTIAL_EVASION";
    }
    this.emit("reviewed", p);
  }

  private release(reason: "issuer" | "fiber", spreadRealMs: number): void {
    const keep: Passage[] = [];
    const spread = Math.max(2000, spreadRealMs * this.speed * 0.8);
    for (const p of this.delayed) {
      if (p.delayReason !== reason) {
        keep.push(p);
        continue;
      }
      p.status = "PROCESSING";
      p.settleAt = this.simTime + this.rng.range(300, spread);
      const before = p.ms.detect + p.ms.ocr + p.ms.publish + p.ms.batch + p.ms.rating;
      p.ms.issuer = Math.max(p.ms.issuer, p.settleAt - p.t - before - p.ms.confirm);
      this.settleList.push(p);
      this.emit("released", p);
    }
    this.delayed = keep;
  }

  private emit<K extends keyof EngineEvents>(evt: K, e: EngineEvents[K]): void {
    for (const fn of this.listeners[evt]) fn(e);
  }

  // ------------------------------------------------------------ scenarios
  private startRun(id: ScenarioId): void {
    const def = SCENARIO_BY_ID[id];
    const recoveryTotal = def.kind === "operation" ? 6000 : Math.max(8000, ((def.durationMin * 0.25 * 60) / REPLAY) * 1000);
    this.runs.set(id, {
      def,
      phase: "active",
      k: 0,
      incidentMin: 0,
      recoveryReal: 0,
      recoveryTotal,
      startedSim: this.simTime,
      opened: def.kind === "operation",
      peakP: 0,
    });
    if (id === "ir" && !isNight(clockParts(this.simTime).hour)) {
      this.irRestore = true;
      this.jumpTo(clockParts(this.simTime).dayStart + 1.0 * 3600_000);
      this.runs.get(id)!.startedSim = this.simTime;
    }
  }

  private endRun(run: Run): void {
    run.phase = "recovering";
    run.peakP = run.def.durationMin ? Math.min(1, run.incidentMin / run.def.durationMin) : 0;
    if (run.def.id === "issuer") this.release("issuer", run.recoveryTotal);
    if (run.def.id === "fiber") this.release("fiber", run.recoveryTotal);
  }

  private advanceRuns(dtReal: number): void {
    for (const run of [...this.runs.values()]) {
      const def = run.def;
      if (run.phase === "active") {
        run.k = Math.min(1, run.k + dtReal / 6000);
        if (def.kind === "incident") {
          run.incidentMin += ((dtReal / 1000) * REPLAY) / 60;
          if (!run.opened && run.incidentMin >= def.mttdMin) run.opened = true;
          if (run.incidentMin >= def.durationMin) this.endRun(run);
        }
      } else {
        run.recoveryReal += dtReal;
        run.k = Math.max(0, 1 - run.recoveryReal / run.recoveryTotal);
        if (run.recoveryReal >= run.recoveryTotal) this.finishRun(run);
      }
    }
  }

  private finishRun(run: Run): void {
    const def = run.def;
    this.runs.delete(def.id);
    if (def.kind === "incident") {
      run.opened = true;
      this.resolved.unshift({ def, startedSim: run.startedSim, durMin: run.incidentMin, peakP: run.peakP });
      if (this.resolved.length > 4) this.resolved.pop();
      const imp = def.impacts.map((i) => this.fmtImpact(i.final * run.peakP, i.fmt)).join(" · ");
      this.session.incidents.push({ name: def.name, mttdMin: def.mttdMin, impact: imp });
      for (const i of def.impacts) {
        if (i.summary === "protected") this.session.protected += i.final * run.peakP;
        if (i.summary === "risk") this.session.risk += i.final * run.peakP;
      }
    }
    if (def.id === "ir" && this.irRestore) {
      this.irRestore = false;
      this.jumpTo(Date.now());
    }
    if (def.id === "issuer") this.release("issuer", 4000);
    if (def.id === "fiber") this.release("fiber", 4000);
  }

  private queueContribution(q: QueueId): number {
    let total = 0;
    for (const run of this.runs.values()) {
      const peak = run.def.queues[q];
      if (!peak || !run.def.durationMin) continue;
      const p = Math.min(1, run.incidentMin / run.def.durationMin);
      if (run.phase === "active") total += peak * Math.min(1, p * 1.6) * run.k;
      else total += peak * Math.min(1, run.peakP * 1.6) * (1 - run.recoveryReal / run.recoveryTotal);
    }
    return total;
  }

  private fmtImpact(v: number, fmt: "int" | "money"): string {
    return fmt === "money" ? MONEY.format(Math.round(v / 100) * 100) : INT.format(Math.round(v));
  }

  // ------------------------------------------------------------ time and aggregates
  private jumpTo(ms: number): void {
    this.simTime = ms;
    this.acc = 0;
    this.recomputeDay();
    this.resetFlow();
    this.resetArrivals();
    this.prefill();
  }

  private resetArrivals(): void {
    this.nextArr = [0, 1].map(() => [0, 1, 2, 3].map(() => this.simTime + this.rng.range(0, 3000)));
  }

  private resetFlow(): void {
    this.crossTimes = [];
    this.flowWindowStart = this.simTime;
  }

  /** "Today so far": integrates the traffic curves analytically from local midnight. */
  private recomputeDay(): void {
    const { dayStart, hour, dow } = clockParts(this.simTime);
    let L = 0;
    let H = 0;
    for (let m = 0; m < hour * 60; m++) {
      L += lightRate(m / 60, dow) / 60;
      H += heavyRate(m / 60, dow) / 60;
    }
    const setL = 0.698 + 0.302 * 0.97 * P_AUTOPAY;
    const setH = 0.9276 + 0.0724 * 0.97 * P_AUTOPAY;
    this.day = {
      start: dayStart,
      tx: Math.round(L + H),
      revenue: (L * AVG_TARIFF.light + H * AVG_TARIFF.heavy) * 0.996,
      settled: L * AVG_TARIFF.light * setL + H * AVG_TARIFF.heavy * setH,
    };
  }

  /** Analytic expectations for the current state (the same probabilities that draw the vehicles). */
  targets(time = this.simTime, baseline = false): Targets {
    const { hour, dow } = clockParts(time);
    const night = isNight(hour);
    const k = (id: ScenarioId) => (baseline ? 0 : this.scenarioK(id));
    const fogK = k("fog");
    const irK = k("ir");
    const gpuK = k("gpu");
    const rates = baseline ? this.baseRates(hour, dow) : this.laneRates(hour, dow);
    let W = 0;
    let identW = 0;
    let confW = 0;
    let unread = 0;
    for (let d = 0; d < 2; d++) {
      for (let l = 0; l < 4; l++) {
        for (const c of CLASSES) {
          const lam = rates[d][l][c];
          if (lam <= 0) continue;
          const irL = d === 0 && l === 2 ? irK : 0;
          const mu = confMu(night, fogK, irL);
          const P = phi((90 - mu) / confSd(fogK, irL));
          const to = gpuK * 0.2;
          const pT = P_TAG[c] * tagReadRate(d as Dir, l);
          const ocrOk = 0.93 * (1 - P) * (1 - to);
          const rev = 0.055 + 0.93 * P * 0.85 + 0.93 * (1 - P) * to;
          const nid = 0.015 + 0.93 * P * 0.15;
          W += lam;
          identW += lam * (pT + (1 - pT) * ocrOk);
          confW += lam * mu;
          unread += lam * 3600 * (1 - pT) * (rev + nid) * AVG_TARIFF[c];
        }
      }
    }
    let p95 = 11.9 + 0.7 * Math.sin(time / 41_000) + 6 * fogK + 160 * k("issuer") + 6 * gpuK;
    const fib = baseline ? undefined : this.runs.get("fiber");
    if (fib) {
      const delayMin = Math.min(fib.incidentMin, 38);
      p95 += delayMin * 60 * (fib.phase === "active" ? 1 : 1 - fib.recoveryReal / fib.recoveryTotal);
    }
    return {
      ident: (identW / W) * 100,
      conf: confW / W,
      p95,
      unreadPerHour: unread,
      expectedPerMin: W * 60,
    };
  }

  private baseRates(hour: number, dow: number): { light: number; heavy: number }[][] {
    const L = lightRate(hour, dow) / 3600 / 2;
    const H = heavyRate(hour, dow) / 3600 / 2;
    return [0, 1].map(() => [0, 1, 2, 3].map((l) => ({ light: L * LANE_SHARE.light[l], heavy: H * LANE_SHARE.heavy[l] })));
  }

  private prefill(): void {
    const keys: SparkKey[] = ["health", "flowPerMin", "ident", "conf", "p95", "unreadPerHour", "revenue", "tx"];
    this.spark = Object.fromEntries(keys.map((k) => [k, [] as number[]])) as Record<SparkKey, number[]>;
    const jitter = new Rng(this.seed + 7);
    for (let i = SPARK_LEN; i >= 1; i--) {
      const t = this.targets(this.simTime - i * 60_000, true);
      const n = () => jitter.normal();
      const flow = t.expectedPerMin * (1 + 0.06 * n());
      this.spark.flowPerMin.push(flow);
      this.spark.tx.push(flow);
      this.spark.revenue.push(flow * (AVG_TARIFF.light * 0.7 + AVG_TARIFF.heavy * 0.3));
      this.spark.ident.push(t.ident + 0.08 * n());
      this.spark.conf.push(t.conf + 0.1 * n());
      this.spark.p95.push(t.p95 + 0.4 * n());
      this.spark.unreadPerHour.push(t.unreadPerHour * (1 + 0.08 * n()));
      this.spark.health.push(94 + 0.3 * n());
    }
    const t = this.targets();
    this.kpi = {
      health: 94,
      txToday: this.day.tx,
      revenueToday: this.day.revenue,
      settledToday: this.day.settled,
      flowPerMin: t.expectedPerMin,
      flowPct: 100,
      ident: t.ident,
      conf: t.conf,
      p95: t.p95,
      unreadPerHour: t.unreadPerHour,
    };
    this.kpi.health = this.health(this.kpi, this.infraCounts());
    this.sparkMinute = Math.floor(this.simTime / 60_000);
    this.minuteCount = 0;
    this.minuteRevenue = 0;
  }

  private smooth(dtReal: number): void {
    const t = this.targets();
    const a = 1 - Math.exp(-dtReal / 4000);
    const kp = this.kpi;
    kp.ident += (t.ident - kp.ident) * a;
    kp.conf += (t.conf - kp.conf) * a;
    kp.p95 += (t.p95 - kp.p95) * a;
    kp.unreadPerHour += (t.unreadPerHour - kp.unreadPerHour) * a;
    const win = Math.min(60_000, this.simTime - this.flowWindowStart);
    let n = 0;
    for (let i = this.crossTimes.length - 1; i >= 0 && this.crossTimes[i] >= this.simTime - win; i--) n++;
    const obs = win >= 10_000 ? (n / win) * 60_000 : t.expectedPerMin;
    kp.flowPerMin += (obs - kp.flowPerMin) * (1 - Math.exp(-dtReal / 3000));
    kp.flowPct = (kp.flowPerMin / (this.baseExpected() || 1)) * 100;
    kp.txToday = this.day.tx;
    kp.revenueToday = this.day.revenue;
    kp.settledToday = this.day.settled;
    const target = this.health(kp, this.infraCounts());
    kp.health += (target - kp.health) * a;
  }

  private baseExpected(): number {
    const { hour, dow } = clockParts(this.simTime);
    return (lightRate(hour, dow) + heavyRate(hour, dow)) / 60;
  }

  private health(kp: KpiSet, infra: { warn: number; crit: number }): number {
    const queues = QUEUES.map((q) => this.queueDepth(q.id));
    const partners = this.partnerViews().map((p) => p.p95);
    return healthIndex({
      ident: kp.ident,
      conf: kp.conf,
      p95: kp.p95,
      maxQueue: Math.max(...queues),
      maxPartnerMs: Math.max(...partners),
      warn: infra.warn,
      crit: infra.crit,
    });
  }

  private recordSpark(): void {
    const minute = Math.floor(this.simTime / 60_000);
    if (minute === this.sparkMinute) return;
    this.sparkMinute = minute;
    const kp = this.kpi;
    const push = (k: SparkKey, v: number) => {
      const arr = this.spark[k];
      arr.push(v);
      if (arr.length > SPARK_LEN) arr.shift();
    };
    push("health", kp.health);
    push("flowPerMin", kp.flowPerMin);
    push("ident", kp.ident);
    push("conf", kp.conf);
    push("p95", kp.p95);
    push("unreadPerHour", kp.unreadPerHour);
    push("tx", this.minuteCount);
    push("revenue", this.minuteRevenue);
    this.minuteCount = 0;
    this.minuteRevenue = 0;
  }

  // ------------------------------------------------------------ derived state
  private rateFactor(): number {
    const { hour, dow } = clockParts(this.simTime);
    return clamp((lightRate(hour, dow) + heavyRate(hour, dow)) / 3600, 0.2, 1.4);
  }

  private queueDepth(q: QueueId): number {
    const base = QUEUES.find((x) => x.id === q)!.base;
    const wobble = 1 + 0.12 * Math.sin(this.simTime / 23_000 + base);
    return Math.max(0, base * (0.5 + 0.5 * this.rateFactor()) * wobble + this.queueContribution(q));
  }

  private queueViews(): QueueView[] {
    return QUEUES.map((q) => {
      const depth = this.queueDepth(q.id);
      const waitMin = this.queueContribution(q.id) / QUEUE_CAPACITY_MIN[q.id];
      let level: Level = depth >= QUEUE_CRIT ? "critical" : depth >= QUEUE_WARN ? "warning" : "ok";
      if (level === "ok" && waitMin >= 30) level = "critical";
      else if (level === "ok" && waitMin >= 10) level = "warning";
      if (q.id === "mlff.dlq" && depth >= 1000 && level === "ok") level = "warning";
      return { id: q.id, depth, waitMin, level };
    });
  }

  private partnerViews(): PartnerView[] {
    const rf = this.rateFactor();
    const issuerK = this.scenarioK("issuer");
    const all = [
      ...ISSUERS.map((o) => ({ id: o.id, name: o.name, base: o.p95 })),
      ...OTHER_PARTNERS.map((o) => ({ id: o.id, name: o.name, base: o.p95 })),
    ];
    return all.map((o, i) => {
      let p95 = o.base * (0.85 + 0.35 * Math.min(rf, 1)) * (1 + 0.05 * Math.sin(this.simTime / 17_000 + i));
      if (o.id === "betapass") p95 += 11_190 * issuerK;
      return { id: o.id, name: o.name, p95, level: levelFor(p95, 1500, 5000, false) };
    });
  }

  private gpuTemp(): number {
    return this.gpuBase + 0.4 * Math.sin(this.simTime / 90_000) + 15 * this.scenarioK("gpu");
  }

  private equipment(): Level[][][] {
    const ir = this.scenarioK("ir");
    return [0, 1].map((d) =>
      [0, 1, 2, 3].map((l) =>
        [0, 1, 2, 3, 4].map((e): Level => {
          if (d === 1 && l === 3 && e === 4) return "warning";
          if (d === 0 && l === 2 && ir > 0.3) {
            if (e === 2) return "critical";
            if (e === 0) return "warning";
          }
          return "ok";
        }),
      ),
    );
  }

  private infra(): InfraItem[] {
    const fiber = this.scenarioK("fiber") > 0.3;
    const exodus = this.scenarioK("exodus");
    const rf = this.rateFactor();
    const gpu = this.gpuTemp();
    const cpu = 38 + 12 * Math.min(rf, 1) + 22 * exodus;
    return [
      { id: "cabinet", label: "Cabinet", value: `${(34.5 + 0.3 * Math.sin(this.simTime / 60_000)).toFixed(1)} °C`, level: "ok" },
      { id: "ups", label: "UPS", value: "52 min", level: "ok" },
      fiber
        ? { id: "fiber", label: "10G fiber", value: "Cut", level: "critical" }
        : { id: "fiber", label: "10G fiber", value: `${Math.round(36 + 10 * Math.min(rf, 1))}%`, level: "ok" },
      fiber
        ? { id: "radio", label: "Radio km 33", value: "Active · 92%", level: "warning" }
        : { id: "radio", label: "Radio km 33", value: "Standby", level: "ok" },
      { id: "gpu", label: "OCR GPU", value: `${gpu.toFixed(1)} °C`, level: levelFor(gpu, 69.9, 84.9, false) },
      { id: "storage", label: "Storage", value: "84%", level: "warning" },
      { id: "cpu", label: "Edge DC CPU", value: `${Math.round(cpu)}%`, level: levelFor(cpu, 80, 95, false) },
    ];
  }

  private infraCounts(): { warn: number; crit: number } {
    let warn = 0;
    let crit = 0;
    const add = (l: Level) => {
      if (l === "warning") warn++;
      if (l === "critical") crit++;
    };
    this.infra().forEach((i) => add(i.level));
    this.equipment().forEach((d) => d.forEach((l) => l.forEach(add)));
    return { warn, crit };
  }

  private nodes(queues: QueueView[], partners: PartnerView[]): Record<string, Level> {
    const k = (id: ScenarioId) => this.scenarioK(id);
    const qLevel = Object.fromEntries(queues.map((q) => [q.id, q.level])) as Record<QueueId, Level>;
    const n: Record<string, Level> = {
      gantry: k("ir") > 0.3 ? "warning" : "ok",
      cabinet: k("fiber") > 0.3 ? "warning" : "ok",
      ingest: k("fiber") > 0.3 ? "warning" : "ok",
      ocr: k("gpu") > 0.3 ? "critical" : "warning",
      q_raw: qLevel["mlff.trip.raw"],
      q_review: qLevel["mlff.ocr.review"],
      q_tag: qLevel["mlff.charge.tag"],
      q_plate: qLevel["mlff.charge.plate"],
      q_dlq: qLevel["mlff.dlq"],
      rating: "ok",
      review: qLevel["mlff.ocr.review"],
      taggw: k("issuer") > 0.3 ? "critical" : "ok",
      billing: "ok",
    };
    for (const p of partners) n[p.id] = p.level;
    return n;
  }

  private problems(): ProblemView[] {
    const out: ProblemView[] = [];
    for (const run of this.runs.values()) {
      const def = run.def;
      if (!run.opened) continue;
      if (def.kind === "operation") {
        out.push({
          id: `run-${def.id}`,
          scenario: def.id,
          status: "Informational",
          severity: "info",
          title: def.title,
          rootCause: def.rootCause,
          action: def.action,
          explanation: def.explanation,
          start: fmtClock(run.startedSim, false),
          duration: "ongoing",
          entities: def.entities,
          impacts: [],
          accelerated: false,
        });
        continue;
      }
      const p = run.phase === "active" ? Math.min(1, run.incidentMin / def.durationMin) : run.peakP;
      out.push({
        id: `run-${def.id}-${run.startedSim}`,
        scenario: def.id,
        status: "Active",
        severity: def.severity,
        title: def.title,
        rootCause: def.rootCause,
        action: def.action,
        explanation: def.explanation,
        start: fmtClock(run.startedSim, false),
        duration: fmtDuration(run.incidentMin) + (run.phase === "recovering" ? " · recovering" : ""),
        mttdMin: def.mttdMin,
        entities: def.entities,
        impacts: def.impacts.map((i) => ({
          label: i.label,
          value: this.fmtImpact(i.final * p, i.fmt),
          note: run.phase === "recovering" ? i.note : undefined,
        })),
        accelerated: true,
      });
    }
    const gpuTouched = this.runs.has("gpu") || this.resolved.some((r) => r.def.id === "gpu");
    if (!gpuTouched) {
      out.push({
        id: "forecast-gpu",
        status: "Forecast",
        severity: "warning",
        title: GPU_FORECAST.title,
        rootCause: GPU_FORECAST.rootCause,
        action: GPU_FORECAST.action,
        explanation: GPU_FORECAST.explanation,
        start: "36 h ago",
        duration: "trend",
        entities: GPU_FORECAST.entities,
        impacts: [{ label: "Throttling at 85 °C forecast in", value: "~2 days" }],
        accelerated: false,
      });
    }
    for (const r of this.resolved) {
      out.push({
        id: `res-${r.def.id}-${r.startedSim}`,
        scenario: r.def.id,
        status: "Resolved",
        severity: r.def.severity,
        title: r.def.title,
        rootCause: r.def.rootCause,
        action: r.def.action,
        explanation: r.def.explanation,
        start: fmtClock(r.startedSim, false),
        duration: fmtDuration(r.durMin),
        mttdMin: r.def.mttdMin,
        entities: r.def.entities,
        impacts: r.def.impacts.map((i) => ({ label: i.label, value: this.fmtImpact(i.final * r.peakP, i.fmt), note: i.note })),
        accelerated: true,
      });
    }
    return out;
  }

  private visibility(night: boolean): number {
    const clear = 9000 - (night ? 3800 : 0) + 400 * Math.sin(this.simTime / 300_000);
    const fog = 95 + 35 * Math.sin(this.simTime / 20_000);
    const k = this.scenarioK("fog");
    return clear * (1 - k) + fog * k;
  }

  forceSnapshot(): void {
    this.lastSnapReal = this.realNow;
    const { hour } = clockParts(this.simTime);
    const night = isNight(hour);
    const queues = this.queueViews();
    const partners = this.partnerViews();
    const kp = { ...this.kpi };
    let inScene = 0;
    this.lanes.forEach((d) => d.forEach((l) => (inScene += l.length)));
    this.version++;
    this.snap = {
      version: this.version,
      simTime: this.simTime,
      speed: this.speed,
      paused: this.paused,
      hour,
      night,
      visibility: this.visibility(night),
      inScene,
      kpi: kp,
      kpiLevel: {
        health: levelFor(kp.health, 97, 90, true),
        flow: levelFor(kp.flowPct, 90, 75, true),
        ident: levelFor(kp.ident, 97, 95, true),
        conf: levelFor(kp.conf, 95, 90, true),
        p95: levelFor(kp.p95, 30, 120, false),
        unread: lossLevel(levelFor(kp.unreadPerHour, 2000, 5000, false)),
      },
      spark: Object.fromEntries(Object.entries(this.spark).map(([k, v]) => [k, v.slice()])) as Record<SparkKey, number[]>,
      feed: this.passages.slice(-12).reverse(),
      queues,
      partners,
      nodes: this.nodes(queues, partners),
      equipment: this.equipment(),
      infra: this.infra(),
      problems: this.problems(),
      scenarios: SCENARIOS.map((s) => {
        const r = this.runs.get(s.id);
        return { id: s.id, phase: r ? r.phase : "off", k: r ? r.k : 0 };
      }),
      replayActive: [...this.runs.values()].some((r) => r.def.kind === "incident"),
      session: { ...this.session, incidents: [...this.session.incidents] },
      highlight: this.getHighlight(),
    };
    for (const fn of this.snapListeners) fn();
  }
}
