import type { EvaluatedInitiative } from "../value-engine";
import { money, pct } from "../format";

export interface Insight {
  severity: "critical" | "serious" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  impact: number; // for ordering (currency or pseudo-magnitude)
}

/**
 * Deterministic "what should management investigate next" rules. Each rule is transparent and
 * fires only on computed data — no model inference.
 */
export function buildInsights(items: EvaluatedInitiative[]): Insight[] {
  const out: Insight[] = [];
  for (const { init, value: v } of items) {
    const href = `/initiatives/${init.id}/overview`;
    if (init.actual) {
      const gap = v.leakage.ladder.BUSINESS_CASE - v.leakage.ladder.CURRENT_RUN_RATE;
      if (gap > 0 && gap / Math.max(1, v.leakage.ladder.BUSINESS_CASE) > 0.2)
        out.push({
          severity: gap / v.leakage.ladder.BUSINESS_CASE > 0.4 ? "critical" : "serious",
          title: `${init.name} is ${pct(gap / v.leakage.ladder.BUSINESS_CASE)} below its business case`,
          detail: `Run-rate ${money(v.leakage.ladder.CURRENT_RUN_RATE)} vs approved ${money(v.leakage.ladder.BUSINESS_CASE)}. Largest driver: ${
            [...v.leakage.steps].filter((s) => s.key !== "adoption-headroom" && s.key !== "not-validated").sort((a, b) => a.amount - b.amount)[0]?.label.toLowerCase() ?? "n/a"
          }.`,
          href,
          impact: gap,
        });
      const aGap = init.target.metrics.adoptionRate - v.post.adoptionRate;
      if (aGap > 0.15)
        out.push({
          severity: "warning",
          title: `Adoption gap on ${init.name}`,
          detail: `${pct(v.post.adoptionRate)} actual vs ${pct(init.target.metrics.adoptionRate)} planned — ${money(-(v.leakage.byCause.LOW_ADOPTION ?? 0))} of annual value at stake.`,
          href: `/initiatives/${init.id}/adoption`,
          impact: -(v.leakage.byCause.LOW_ADOPTION ?? 0),
        });
      const unvalidated = v.leakage.ladder.CURRENT_RUN_RATE - v.leakage.ladder.FINANCE_VALIDATED;
      if (unvalidated > 15_000_000 && ["VALIDATE", "REALIZE", "OPTIMIZE"].includes(init.stage))
        out.push({
          severity: "info",
          title: `${money(unvalidated)} awaiting Finance validation — ${init.name}`,
          detail: "Benefits measured but not yet finance-validated should not be quoted as P&L impact.",
          href: `/initiatives/${init.id}/value`,
          impact: unvalidated * 0.5,
        });
      if (!v.roi.netAnnualBenefit.undefinedReason && v.roi.netAnnualBenefit.value < 0)
        out.push({
          severity: "critical",
          title: `${init.name} costs more to run than it returns`,
          detail: `Net annual benefit ${money(v.roi.netAnnualBenefit.value)}. Review AI run cost (${money(v.tco.recurring.value)}/yr) and adoption.`,
          href: `/initiatives/${init.id}/costs`,
          impact: Math.abs(v.roi.netAnnualBenefit.value) * 2,
        });
    }
    if (v.capacity.reconciliation.status === "FAIL")
      out.push({
        severity: "warning",
        title: `Baseline data does not reconcile — ${init.name}`,
        detail: v.capacity.reconciliation.message,
        href: `/initiatives/${init.id}/baseline`,
        impact: 5_000_000,
      });
    if (v.leakage.costVariance > 0.1 * Math.max(1, init.businessCase.approvedInvestment) && init.businessCase.approvedInvestment > 0)
      out.push({
        severity: "serious",
        title: `Implementation cost overrun — ${init.name}`,
        detail: `${money(v.leakage.costVariance)} above approved investment of ${money(init.businessCase.approvedInvestment)}.`,
        href: `/initiatives/${init.id}/costs`,
        impact: v.leakage.costVariance,
      });
    const weakAgents = init.agents.filter((a) => a.status === "LIVE" && a.performance.overrideRate > 0.12);
    if (weakAgents.length)
      out.push({
        severity: "warning",
        title: `High human override on ${weakAgents.map((a) => a.name).join(", ")}`,
        detail: `Override rate ${weakAgents.map((a) => pct(a.performance.overrideRate)).join(", ")} — erodes automation benefit and raises cost per outcome.`,
        href: `/initiatives/${init.id}/agents`,
        impact: 3_000_000 * weakAgents.length,
      });
  }
  const rank = { critical: 0, serious: 1, warning: 2, info: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.impact - a.impact);
}
