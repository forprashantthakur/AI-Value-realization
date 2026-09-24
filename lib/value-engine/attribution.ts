import type { Benefit, BenefitStatus, Confidence, EvidenceType } from "../domain/types";
import { BENEFIT_STATUSES } from "../domain/types";

export const STATUS_RANK: Record<BenefitStatus, number> = Object.fromEntries(
  BENEFIT_STATUSES.map((s, i) => [s, i]),
) as Record<BenefitStatus, number>;

export function statusAtLeast(status: BenefitStatus, floor: BenefitStatus): boolean {
  return STATUS_RANK[status] >= STATUS_RANK[floor];
}

/** Evidence strength ranking — telemetry and finance validation outrank surveys and estimates. */
export const EVIDENCE_STRENGTH: Record<EvidenceType, number> = {
  FINANCE_VALIDATED: 3,
  SYSTEM_TELEMETRY: 3,
  PROCESS_MINING: 3,
  BUSINESS_OWNER_VALIDATED: 2,
  SURVEY: 1,
  BENCHMARK: 1,
  ESTIMATED: 0,
};

export const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  SYSTEM_TELEMETRY: "System telemetry",
  PROCESS_MINING: "Process mining",
  FINANCE_VALIDATED: "Finance validated",
  BUSINESS_OWNER_VALIDATED: "Business owner validated",
  SURVEY: "Survey",
  ESTIMATED: "Estimated",
  BENCHMARK: "Benchmark",
};

const FREQUENCY_POINTS: Record<Benefit["measurementFrequency"], number> = {
  REALTIME: 2,
  WEEKLY: 2,
  MONTHLY: 2,
  QUARTERLY: 1,
  ANNUAL: 0,
  ONE_OFF: 0,
};

export interface DataConfidence {
  level: Confidence;
  points: number;
  maxPoints: number;
  factors: { factor: string; points: number; max: number; basis: string }[];
  disclaimer: string;
}

/**
 * Rule-based data-confidence rating (NOT a statistical confidence interval).
 * Five factors, 10 points: source quality (0-3), measurement frequency (0-2), evidence breadth (0-2),
 * sample size (0-1), finance validation (0-2). High ≥ 7, Medium 4–6, Low ≤ 3.
 */
export function dataConfidence(b: Benefit): DataConfidence {
  const best = b.evidence.reduce((m, e) => Math.max(m, EVIDENCE_STRENGTH[e.type]), 0);
  const freq = FREQUENCY_POINTS[b.measurementFrequency];
  const breadth = Math.min(2, new Set(b.evidence.map((e) => e.type)).size);
  const maxSample = b.evidence.reduce((m, e) => Math.max(m, e.sampleSize ?? 0), 0);
  const sample = maxSample >= 100 ? 1 : 0;
  const fin = statusAtLeast(b.status, "FINANCE_VALIDATED") || b.evidence.some((e) => e.type === "FINANCE_VALIDATED") ? 2 : 0;
  const points = best + freq + breadth + sample + fin;
  const level: Confidence = points >= 7 ? "HIGH" : points >= 4 ? "MEDIUM" : "LOW";
  return {
    level,
    points,
    maxPoints: 10,
    factors: [
      { factor: "Source quality", points: best, max: 3, basis: "Strongest evidence type (telemetry / process mining / finance = 3; owner validation = 2; survey / benchmark = 1; estimate = 0)" },
      { factor: "Measurement frequency", points: freq, max: 2, basis: `Measured ${b.measurementFrequency.toLowerCase().replace("_", "-")}` },
      { factor: "Evidence breadth", points: breadth, max: 2, basis: `${b.evidence.length} evidence item(s) of ${new Set(b.evidence.map((e) => e.type)).size} type(s)` },
      { factor: "Sample size", points: sample, max: 1, basis: maxSample ? `Largest sample n = ${maxSample.toLocaleString("en-IN")} (≥ 100 scores 1)` : "No sample size recorded" },
      { factor: "Finance validation", points: fin, max: 2, basis: fin ? "Finance has validated this benefit" : "Not yet finance-validated" },
    ],
    disclaimer:
      "Rule-based indicator of evidence quality. It is not a statistical confidence level and does not quantify measurement error.",
  };
}

const CONF_RANK: Record<Confidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/** Portfolio / initiative confidence = value-weighted, rounded down to be conservative. */
export function aggregateConfidence(items: { confidence: Confidence; weight: number }[]): Confidence {
  const w = items.reduce((a, i) => a + Math.abs(i.weight), 0);
  if (w === 0) return "LOW";
  const score = items.reduce((a, i) => a + CONF_RANK[i.confidence] * Math.abs(i.weight), 0) / w;
  return score >= 1.67 ? "HIGH" : score >= 0.84 ? "MEDIUM" : "LOW";
}
