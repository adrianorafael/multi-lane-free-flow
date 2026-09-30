/** Simulation clock helpers. The plaza runs on the viewer's local time zone. */

export interface ClockParts {
  /** Fractional hour 0–24. */
  hour: number;
  /** 1 = Monday … 7 = Sunday. */
  dow: number;
  /** Start of the local day (00:00) in epoch ms. */
  dayStart: number;
}

export function clockParts(ms: number): ClockParts {
  const d = new Date(ms);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const day = d.getDay();
  return { hour: (ms - dayStart) / 3600_000, dow: day === 0 ? 7 : day, dayStart };
}

export function isNight(hour: number): boolean {
  return hour < 6 || hour >= 19;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtClock(ms: number, withSeconds = true): string {
  const d = new Date(ms);
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad(d.getSeconds())}` : base;
}

export function fmtClockMs(ms: number): string {
  return `${fmtClock(ms)}.${String(new Date(ms).getMilliseconds()).padStart(3, "0")}`;
}

/** Duration in minutes → "2h 51min". */
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${pad(m % 60)}min` : `${m} min`;
}
