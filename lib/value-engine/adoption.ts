import type { AiAgent, Measurement, ProcessMetrics } from "../domain/types";
import { fmt, metric, pct, type Metric } from "./metric";
import { clamp, safeDiv, sum } from "./units";

const LOWER_BETTER: (keyof ProcessMetrics)[] = ["avgHandlingMinutes", "cycleTimeHours", "errorRate", "reworkRate", "exceptionRate"];
const HIGHER_BETTER: (keyof ProcessMetrics)[] = ["firstTimeRight", "slaAchievement"];
const EFFORT_FIELDS: (keyof ProcessMetrics)[] = ["avgHandlingMinutes", "reworkRate"];

/**
 * Blended metrics are a mix of AI-handled and non-AI volume:
 *   blended = adoption × AI-path value + (1 − adoption) × baseline value
 * So the AI-path value can be recovered from a measured snapshot and re-blended at any adoption
 * level. `automationScale` scales the AI-path effort reduction (e.g. 1.2 = 20% more effort removed).
 * This single mechanism powers Potential / Business-case valuation and scenario analysis,
 * so there is no duplicated financial logic.
 */
export function reblendAtAdoption(
  baseline: ProcessMetrics,
  snapshot: ProcessMetrics,
  newAdoption: number,
  opts: { automationScale?: number; cycleTimeReduction?: number; errorReduction?: number } = {},
): ProcessMetrics {
  const a = snapshot.adoptionRate;
  const a2 = clamp(newAdoption, 0, 1);
  const scale = opts.automationScale ?? 1;
  const out: ProcessMetrics = { ...snapshot, adoptionRate: a2 };
  if (a <= 0) return out;

  for (const f of [...LOWER_BETTER, ...HIGHER_BETTER]) {
    const xb = baseline[f] as number;
    const xs = snapshot[f] as number;
    let xai = (xs - (1 - a) * xb) / a;
    if (LOWER_BETTER.includes(f)) xai = Math.max(0, xai);
    if (EFFORT_FIELDS.includes(f) && scale !== 1 && xb > 0) {
      const r = clamp(1 - xai / xb, 0, 1);
      xai = xb * (1 - clamp(r * scale, 0, 1));
    }
    let blended = a2 * xai + (1 - a2) * xb;
    if (HIGHER_BETTER.includes(f)) blended = clamp(blended, 0, 1);
    (out[f] as number) = blended;
  }
  // Direct overrides expressed as absolute reduction vs baseline.
  if (opts.cycleTimeReduction !== undefined) out.cycleTimeHours = baseline.cycleTimeHours * (1 - clamp(opts.cycleTimeReduction, 0, 1));
  if (opts.errorReduction !== undefined) out.errorRate = baseline.errorRate * (1 - clamp(opts.errorReduction, 0, 1));
  out.automationRate = clamp(safeDiv(snapshot.automationRate, a) * a2 * scale, 0, 1);
  return out;
}

/** AI-path effort reduction implied by a blended snapshot (0..1). */
export function aiPathEffortReduction(baseline: ProcessMetrics, snapshot: ProcessMetrics): number {
  const a = snapshot.adoptionRate;
  if (a <= 0 || baseline.avgHandlingMinutes <= 0) return 0;
  const ai = (snapshot.avgHandlingMinutes - (1 - a) * baseline.avgHandlingMinutes) / a;
  return clamp(1 - ai / baseline.avgHandlingMinutes, 0, 1);
}

export interface AdoptionSummary {
  eligibleUsers: number;
  activeUsers: number;
  userAdoption: Metric;
  transactionAdoption: Metric;
  aiAssistedTransactions: number;
  aiAutomatedTransactions: number;
  acceptanceRate: Metric;
  overrideRate: number;
  agentCompletionRate: number;
  escalationRate: number;
  failureRate: number;
}

export function computeAdoption(post: ProcessMetrics, latest: Measurement | undefined, agents: AiAgent[]): AdoptionSummary {
  const eligible = latest?.eligibleUsers ?? post.users ?? 0;
  const active = latest?.activeUsers ?? 0;
  const tasks = sum(agents.map((a) => a.performance.tasksPerMonth));
  const w = (sel: (a: AiAgent) => number) =>
    tasks > 0 ? sum(agents.map((a) => sel(a) * a.performance.tasksPerMonth)) / tasks : 0;
  const override = w((a) => a.performance.overrideRate);
  const volume = post.transactionsPerYear;
  const userAdoption = metric({
    key: "userAdoption",
    label: "User adoption",
    value: safeDiv(active, eligible),
    unit: "percent",
    definition: "Monthly active users of the AI capability as a share of eligible users.",
    formula: "Monthly active users ÷ Eligible users",
    inputs: [
      { name: "Monthly active users", value: active, unit: "count" },
      { name: "Eligible users", value: eligible, unit: "count" },
    ],
    assumptions: ["Latest month in the measurement series."],
    example: `${fmt(active)} ÷ ${fmt(eligible)} = ${pct(safeDiv(active, eligible))}`,
  });
  const transactionAdoption = metric({
    key: "transactionAdoption",
    label: "Transaction adoption",
    value: post.adoptionRate,
    unit: "percent",
    definition: "Share of eligible transactions processed through the AI path (assisted or automated).",
    formula: "AI-path transactions ÷ Eligible transactions",
    inputs: [{ name: "Post-AI adoption rate", value: post.adoptionRate, unit: "percent" }],
    assumptions: [],
  });
  const acceptanceRate = metric({
    key: "acceptanceRate",
    label: "AI acceptance rate",
    value: 1 - override,
    unit: "percent",
    definition: "Share of AI outputs accepted without human modification (task-weighted across agents).",
    formula: "1 − Task-weighted human override rate",
    inputs: agents.map((a) => ({ name: `${a.name} override`, value: a.performance.overrideRate, unit: "percent" as const })),
    assumptions: ["Weighted by monthly task volume."],
  });
  return {
    eligibleUsers: eligible,
    activeUsers: active,
    userAdoption,
    transactionAdoption,
    aiAssistedTransactions: volume * post.adoptionRate * (1 - safeDiv(post.automationRate, post.adoptionRate)),
    aiAutomatedTransactions: volume * post.automationRate,
    acceptanceRate,
    overrideRate: override,
    agentCompletionRate: w((a) => a.performance.taskCompletionRate),
    escalationRate: w((a) => a.performance.escalationRate),
    failureRate: w((a) => 1 - a.performance.taskCompletionRate),
  };
}

/**
 * Top-down cross-check: Realized = Potential × Adoption × Performance × Attribution.
 * Each factor can be switched off in settings. It is shown alongside (never instead of) the
 * bottom-up benefit-line valuation.
 */
export function realizedValueModel(args: {
  potential: number;
  adoption: number;
  performance: number;
  attribution: number;
  use: { useAdoption: boolean; usePerformance: boolean; useAttribution: boolean };
}): Metric {
  const a = args.use.useAdoption ? args.adoption : 1;
  const p = args.use.usePerformance ? args.performance : 1;
  const t = args.use.useAttribution ? args.attribution : 1;
  const v = args.potential * a * p * t;
  return metric({
    key: "realizedValueModel",
    label: "Realized value (top-down model)",
    value: v,
    unit: "currency",
    definition:
      "Top-down cross-check of realized value from full potential. Differences vs the bottom-up figure point to data gaps or non-linear effects.",
    formula: "Potential value × Adoption × Performance × Attribution",
    inputs: [
      { name: "Potential value", value: args.potential, unit: "currency" },
      { name: "Adoption" + (args.use.useAdoption ? "" : " (disabled)"), value: a, unit: "percent" },
      { name: "Performance vs target" + (args.use.usePerformance ? "" : " (disabled)"), value: p, unit: "percent" },
      { name: "Attribution" + (args.use.useAttribution ? "" : " (disabled)"), value: t, unit: "percent" },
    ],
    assumptions: [
      "Performance = actual AI-path effort reduction ÷ target AI-path effort reduction (capped at 120%).",
      "Attribution = benefit-weighted average AI attribution.",
    ],
    example: `${fmt(args.potential)} × ${pct(a)} × ${pct(p)} × ${pct(t)} = ${fmt(v)}`,
  });
}
