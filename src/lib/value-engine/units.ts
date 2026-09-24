import type { TimeUnit } from "../domain/types";

const TO_MINUTES: Record<TimeUnit, number> = {
  SECONDS: 1 / 60,
  MINUTES: 1,
  HOURS: 60,
  DAYS: 60 * 24,
};

/** Convert a duration to minutes. Calendar days (24h) — use for elapsed time, not effort. */
export function toMinutes(value: number, unit: TimeUnit): number {
  return value * TO_MINUTES[unit];
}

export function toHours(value: number, unit: TimeUnit): number {
  return toMinutes(value, unit) / 60;
}

export function fromMinutes(minutes: number, unit: TimeUnit): number {
  return minutes / TO_MINUTES[unit];
}

/** Division that returns `fallback` rather than Infinity/NaN. */
export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || !Number.isFinite(denominator)) return fallback;
  const r = numerator / denominator;
  return Number.isFinite(r) ? r : fallback;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Relative reduction (baseline → current) where lower is better. Positive = improvement. */
export function reductionPct(baseline: number, current: number): number {
  return safeDiv(baseline - current, baseline);
}
