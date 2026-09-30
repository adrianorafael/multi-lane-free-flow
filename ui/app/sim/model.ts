/** Business model of the fictitious plaza operated by "Multi-lane Free Flow". */

export const GANTRY_ID = "G-05";
export const GANTRY_NAME = "Coastal Highway km 38";
export const TARIFF_CLASS1 = 4.5;

export type Dir = 0 | 1; // 0 = INB (inbound to the city, ←) · 1 = OUT (outbound to the coast, →)
export const DIR_CODE = ["INB", "OUT"] as const;
export const DIR_NAME = ["Inbound (to city)", "Outbound (to coast)"] as const;
export type VehicleClass = "light" | "heavy";

/** Vehicles per hour (both directions) — typical weekday curve with morning and evening peaks. */
export function lightRate(h: number, dow: number): number {
  const base =
    0.16 +
    0.62 * Math.exp(-((h - 8) ** 2) / 7) +
    0.78 * Math.exp(-((h - 18) ** 2) / 9) +
    0.38 * Math.exp(-((h - 13) ** 2) / 14);
  const f = dow === 5 ? 1.12 : dow === 6 ? 0.9 : dow === 7 ? 0.97 : 1.0;
  return 2940 * base * f;
}

export function heavyRate(h: number, dow: number): number {
  const base = 0.55 + 0.45 * Math.exp(-((h - 11) ** 2) / 40);
  const f = dow === 6 ? 0.7 : dow === 7 ? 0.45 : 1.0;
  return 933 * base * f;
}

export const LANE_SHARE: Record<VehicleClass, readonly number[]> = {
  light: [0.3, 0.3, 0.25, 0.15],
  heavy: [0, 0.1, 0.45, 0.45],
};

export const P_TAG: Record<VehicleClass, number> = { light: 0.7, heavy: 0.93 };

export type Kind = "car" | "moto" | "carTrailer" | "bus" | "truck";

export interface Category {
  cls: number;
  vclass: VehicleClass;
  axles: number;
  mult: number;
  share: number;
  kind: Kind;
  label: string;
}

export const CATEGORIES: readonly Category[] = [
  { cls: 1, vclass: "light", axles: 2, mult: 1.0, share: 0.85, kind: "car", label: "Class 1 · car" },
  { cls: 9, vclass: "light", axles: 2, mult: 0.5, share: 0.05, kind: "moto", label: "Class 9 · motorcycle" },
  { cls: 3, vclass: "light", axles: 3, mult: 1.5, share: 0.06, kind: "carTrailer", label: "Class 3 · car + semi-trailer" },
  { cls: 5, vclass: "light", axles: 4, mult: 2.0, share: 0.04, kind: "carTrailer", label: "Class 5 · car + trailer" },
  { cls: 2, vclass: "heavy", axles: 2, mult: 2.0, share: 0.08, kind: "bus", label: "Class 2 · bus / 2-axle truck" },
  { cls: 4, vclass: "heavy", axles: 3, mult: 3.0, share: 0.14, kind: "truck", label: "Class 4 · 3-axle truck" },
  { cls: 6, vclass: "heavy", axles: 4, mult: 4.0, share: 0.15, kind: "truck", label: "Class 6 · 4-axle truck" },
  { cls: 7, vclass: "heavy", axles: 5, mult: 5.0, share: 0.22, kind: "truck", label: "Class 7 · 5-axle truck" },
  { cls: 8, vclass: "heavy", axles: 6, mult: 6.0, share: 0.3, kind: "truck", label: "Class 8 · 6-axle truck" },
  { cls: 10, vclass: "heavy", axles: 7, mult: 7.0, share: 0.11, kind: "truck", label: "Class 10 · road train" },
];

export function avgMult(vclass: VehicleClass): number {
  return CATEGORIES.filter((c) => c.vclass === vclass).reduce((s, c) => s + c.mult * c.share, 0);
}

/** Fictitious tag issuers (toll tag providers). */
export interface Issuer {
  id: string;
  name: string;
  share: number;
  /** Baseline p95 of the debit API (ms). */
  p95: number;
}

export const ISSUERS: readonly Issuer[] = [
  { id: "alphatag", name: "AlphaTag", share: 0.53, p95: 180 },
  { id: "betapass", name: "BetaPass", share: 0.25, p95: 210 },
  { id: "gammatoll", name: "GammaToll", share: 0.14, p95: 165 },
  { id: "deltamove", name: "DeltaMove", share: 0.045, p95: 240 },
  { id: "omegapay", name: "OmegaPay", share: 0.035, p95: 230 },
];

export const OTHER_PARTNERS = [
  { id: "payments", name: "Payment gateway", p95: 320 },
  { id: "registry", name: "Vehicle registry", p95: 620 },
  { id: "authority", name: "Toll authority", p95: 480 },
] as const;

export const QUEUES = [
  { id: "mlff.trip.raw", base: 90 },
  { id: "mlff.ocr.review", base: 200 },
  { id: "mlff.charge.tag", base: 110 },
  { id: "mlff.charge.plate", base: 70 },
  { id: "mlff.dlq", base: 0 },
] as const;
export type QueueId = (typeof QUEUES)[number]["id"];
export const QUEUE_WARN = 5000;
export const QUEUE_CRIT = 20000;

export const EQUIP = ["Front LPR camera", "Rear LPR camera", "IR illuminator", "Tag reader", "Laser scanner"] as const;
export const EQUIP_SHORT = ["LPR·F", "LPR·R", "IR", "TAG", "Laser"] as const;

/** Share of plate-only (no tag) customers with account auto-pay (card / instant payment). */
export const P_AUTOPAY = 0.38;

/** KPI thresholds [warning, critical]. */
export const LIMITS = {
  health: [97, 90],
  flow: [90, 75],
  ident: [97, 95],
  ocr: [95, 90],
  p95: [30, 120],
  unreadRevenue: [2000, 5000],
  partnerMs: [1500, 5000],
} as const;
