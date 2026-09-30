/* Simulator calibration tests. Run with: npm run test:sim */
import { Engine } from "../engine";
import type { Passage } from "../types";
import type { ScenarioId } from "../scenarios";

// Tuesday, 2026-09-29, 14:00 local time.
const TUESDAY_2PM = new Date(2026, 8, 29, 14, 0, 0).getTime();

let failures = 0;
function check(name: string, value: number, lo: number, hi: number): void {
  const ok = value >= lo && value <= hi;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${value.toFixed(2)} (expected ${lo}–${hi})`);
}

function run(engine: Engine, realMs: number, frame = 100, clock = { now: 1000 }): void {
  for (let t = 0; t < realMs; t += frame) {
    clock.now += frame;
    engine.tick(clock.now);
  }
}

function fresh(seed = 20260929): { e: Engine; clock: { now: number } } {
  const e = new Engine(seed);
  e.setSimTime(TUESDAY_2PM);
  const clock = { now: 1000 };
  e.tick(clock.now);
  return { e, clock };
}

// ---------------------------------------------------------------- determinism
{
  const a = fresh();
  const b = fresh();
  const pa: string[] = [];
  const pb: string[] = [];
  a.e.on("crossing", (p) => pa.push(`${p.plate.text}|${p.method}`));
  b.e.on("crossing", (p) => pb.push(`${p.plate.text}|${p.method}`));
  run(a.e, 60_000, 100, a.clock);
  run(b.e, 60_000, 100, b.clock);
  const same = pa.length > 20 && pa.join() === pb.join();
  if (!same) failures++;
  console.log(`${same ? "ok  " : "FAIL"} determinism: ${pa.length} identical transactions with the same seed`);
}

// ---------------------------------------------------------------- 1 simulated hour at 2 pm (weekday)
{
  const { e, clock } = fresh();
  e.setSpeed(10);
  const passages: Passage[] = [];
  const lat: number[] = [];
  e.on("crossing", (p) => passages.push(p));
  e.on("settled", (p) => {
    if (p.method === "TAG" && p.settledAt) lat.push((p.settledAt - p.t) / 1000);
  });
  run(e, 360_000, 100, clock);
  const n = passages.length;
  const auto = passages.filter((p) => p.method === "TAG" || p.method === "OCR").length;
  const conf = passages.reduce((s, p) => s + p.conf, 0) / n;
  lat.sort((x, y) => x - y);
  const p95 = lat[Math.floor(lat.length * 0.95)];
  const snap = e.getSnapshot();
  console.log(`     transactions in 1 simulated hour: ${n}`);
  check("volume per hour at 2 pm (~2,760)", n, 2450, 3100);
  check("observed automatic identification (%)", (auto / n) * 100, 97.6, 99.2);
  check("observed mean OCR confidence (%)", conf, 98.0, 99.0);
  check("observed tag p95 (s)", p95, 10, 13.5);
  check("KPI identification (%)", snap.kpi.ident, 98.0, 98.8);
  check("KPI OCR confidence (%)", snap.kpi.conf, 98.0, 99.0);
  check("KPI p95 (s)", snap.kpi.p95, 10, 13.5);
  check("KPI unread revenue ($/h)", snap.kpi.unreadPerHour, 220, 360);
  check("KPI flow vs expected (%)", snap.kpi.flowPct, 85, 115);
  check("health in normal operation", snap.kpi.health, 93, 95);
}

// ---------------------------------------------------------------- health at each scenario's plateau
const ranges: Record<ScenarioId, [number, number, number]> = {
  // [real ms until the plateau, min, max]
  exodus: [30_000, 92, 96],
  fog: [60_000, 70, 82],
  ir: [45_000, 80, 90],
  issuer: [45_000, 78, 88],
  fiber: [30_000, 74, 89],
  gpu: [30_000, 84, 90],
};
for (const [id, [ms, lo, hi]] of Object.entries(ranges) as [ScenarioId, [number, number, number]][]) {
  const { e, clock } = fresh();
  e.toggleScenario(id);
  run(e, ms, 100, clock);
  check(`health in scenario "${id}"`, e.getSnapshot().kpi.health, lo, hi);
}

// ---------------------------------------------------------------- replay: scripted final values
{
  const { e, clock } = fresh();
  e.toggleScenario("issuer");
  run(e, 140_000, 100, clock);
  const snap = e.getSnapshot();
  const res = snap.problems.find((p) => p.status === "Resolved" && p.scenario === "issuer");
  const ok = !!res && res.impacts[1].value.includes("29,600") && res.duration.startsWith("2h");
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} BetaPass replay: ${res ? res.impacts.map((i) => `${i.label}=${i.value}`).join("; ") + " · " + res.duration : "not resolved"}`);
}

console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) failed.`);
if (failures > 0) process.exit(1);
