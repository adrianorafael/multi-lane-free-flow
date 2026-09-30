/** Scene geometry (viewBox 1600 × 560). Inbound on top (←), outbound at the bottom (→). Lane 1 is next to the median. */
export const LANE_H = 50;
export const INB_TOP = 56;
export const MEDIAN_TOP = 256;
export const OUT_TOP = 296;
export const OUT_BOTTOM = 496;

export function laneCenterY(dir: number, lane0: number): number {
  return dir === 0 ? MEDIAN_TOP - LANE_H / 2 - lane0 * LANE_H : OUT_TOP + LANE_H / 2 + lane0 * LANE_H;
}

export function laneTop(dir: number, lane0: number): number {
  return laneCenterY(dir, lane0) - LANE_H / 2;
}

/** Position of equipment `e` (0–4) status LED for a lane on the gantry. */
export function ledPos(dir: number, lane0: number, e: number): { x: number; y: number } {
  return { x: 800, y: laneCenterY(dir, lane0) - 16 + e * 8 };
}
