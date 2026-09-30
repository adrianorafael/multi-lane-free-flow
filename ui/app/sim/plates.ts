import type { Rng } from "./rng";

export interface Plate {
  text: string;
  format: "standard" | "compact";
  /** Red characters (commercial / for-hire vehicle). */
  commercial: boolean;
}

const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).join("");

/** Fictitious plates: "ABC-1234" (standard) or "7ABC123" (compact). Both end with two digits. */
export function makePlate(rng: Rng, heavy: boolean): Plate {
  const L = () => LETTERS[rng.int(0, 25)];
  const N = () => String(rng.int(0, 9));
  const commercial = heavy ? rng.next() < 0.6 : rng.next() < 0.03;
  if (rng.next() < 0.8) {
    return { text: `${L()}${L()}${L()}-${N()}${N()}${N()}${N()}`, format: "standard", commercial };
  }
  return { text: `${N()}${L()}${L()}${L()}${N()}${N()}${N()}`, format: "compact", commercial };
}

/** Demo masking: hides only the last two digits. */
export function maskPlate(text: string, masked: boolean): string {
  return masked ? `${text.slice(0, -2)}••` : text;
}
