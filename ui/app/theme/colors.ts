/**
 * Single palette for the app: monitoring status (green / yellow / red) plus the fictitious
 * "Multi-lane Free Flow" brand. No color is defined outside this file; UI chrome uses Strato tokens.
 */

export const STATUS = {
  ok: "#22A652",
  warning: "#F5C400",
  critical: "#DC172A",
  neutral: "#8C939F",
} as const;

export const BRAND = {
  navy: "#14213D",
  teal: "#0FA3B1",
  aqua: "#7FE7DC",
} as const;

export type Level = "ok" | "warning" | "critical" | "neutral";

export const LEVEL_COLOR: Record<Level, string> = {
  ok: STATUS.ok,
  warning: STATUS.warning,
  critical: STATUS.critical,
  neutral: STATUS.neutral,
};

/** Readable text on top of each level's background. */
export const LEVEL_TEXT: Record<Level, string> = {
  ok: "#FFFFFF",
  warning: "#1B1B1B",
  critical: "#FFFFFF",
  neutral: "#FFFFFF",
};

export type Method = "TAG" | "OCR" | "REVIEW" | "UNREAD";

/** Identification method: both automatic methods are "ok" greens; review is yellow, unread is red. */
export const METHOD_COLOR: Record<Method, string> = {
  TAG: "#137A3B",
  OCR: "#6CCB5F",
  REVIEW: STATUS.warning,
  UNREAD: STATUS.critical,
};

export const METHOD_LEVEL: Record<Method, Level> = {
  TAG: "ok",
  OCR: "ok",
  REVIEW: "warning",
  UNREAD: "critical",
};

export const METHOD_LABEL: Record<Method, string> = {
  TAG: "Tag",
  OCR: "Automatic OCR",
  REVIEW: "Human review",
  UNREAD: "Unread",
};

/** Realistic body paint (carries no status meaning). */
export const PAINT = ["#F4F5F7", "#F4F5F7", "#C9CDD2", "#C9CDD2", "#2B2F33", "#2B2F33", "#B3262E", "#2E5C9A", "#6B7078", "#E9E2D0"];
export const TRUCK_CAB = ["#F4F5F7", "#2E5C9A", "#B3262E", "#E7A93B", "#3E7A4A", "#C9CDD2"];
export const TRAILER = ["#D9DCE0", "#BFC4CA", "#A7ADB4", "#E6E1D5", "#8E959D"];

export interface ScenePalette {
  verge: string;
  vergeDetail: string;
  median: string;
  asphalt: string;
  lane: string;
  gantry: string;
  gantryShadow: string;
  building: string;
  label: string;
}

export const SCENE: Record<"light" | "dark", ScenePalette> = {
  light: {
    verge: "#CFE3C3",
    vergeDetail: "#9CC78B",
    median: "#8FBF7A",
    asphalt: "#4A4F55",
    lane: "#E9EDF1",
    gantry: "#DDE3E8",
    gantryShadow: "rgba(0,0,0,0.28)",
    building: "#EEF1F4",
    label: "#14213D",
  },
  dark: {
    verge: "#17291E",
    vergeDetail: "#23402C",
    median: "#1F3A26",
    asphalt: "#2C3035",
    lane: "#B9C0C7",
    gantry: "#9AA5AF",
    gantryShadow: "rgba(0,0,0,0.45)",
    building: "#39424B",
    label: "#E6ECF2",
  },
};

export function levelFor(value: number, warn: number, crit: number, higherIsBetter: boolean): Level {
  if (higherIsBetter) {
    if (value >= warn) return "ok";
    if (value >= crit) return "warning";
    return "critical";
  }
  if (value <= warn) return "ok";
  if (value <= crit) return "warning";
  return "critical";
}
