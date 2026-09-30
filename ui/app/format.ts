const NF = new Map<string, Intl.NumberFormat>();

function nf(min: number, max: number, style?: "currency"): Intl.NumberFormat {
  const key = `${min}-${max}-${style ?? ""}`;
  let f = NF.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      ...(style ? { style, currency: "USD" } : {}),
    });
    NF.set(key, f);
  }
  return f;
}

export const fmtInt = (v: number) => nf(0, 0).format(Math.round(v));
export const fmtDec = (v: number, d = 1) => nf(d, d).format(v);
export const fmtPct = (v: number, d = 1) => `${fmtDec(v, d)}%`;
export const fmtMoney = (v: number, d = 2) => nf(d, d, "currency").format(v);

/** Compact money: "$1.53M", "$29.6K". */
export function fmtMoneyShort(v: number): string {
  if (v >= 1e6) return `$${fmtDec(v / 1e6, 2)}M`;
  if (v >= 1e4) return `$${fmtDec(v / 1e3, 1)}K`;
  return fmtMoney(v, 0);
}

export function fmtMs(ms: number): string {
  if (ms >= 60_000) return `${fmtDec(ms / 60_000, 1)} min`;
  if (ms >= 1000) return `${fmtDec(ms / 1000, 1)} s`;
  return `${fmtInt(ms)} ms`;
}

export function fmtSeconds(s: number): string {
  if (s >= 120) return `${fmtInt(s / 60)} min`;
  return `${fmtDec(s, 1)} s`;
}
