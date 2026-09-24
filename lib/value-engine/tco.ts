import type { AiAgent, CostCategory, CostItem, ModelPrice } from "../domain/types";
import { fmt, metric, type Metric } from "./metric";
import { annualLlmCostForAgents } from "./agent-economics";
import { sum } from "./units";

export interface TcoLine {
  category: CostCategory;
  subcategory: string;
  recurrence: "ONE_TIME" | "RECURRING";
  amount: number;
  derived: boolean;
}

export interface TcoResult {
  lines: TcoLine[];
  oneTime: Metric;
  recurring: Metric;
  derivedLlmAnnual: number;
  byCategory: Record<CostCategory, { oneTime: number; recurring: number }>;
  tcoOverHorizon: (years: number) => number;
  notes: string[];
}

/**
 * Total cost of ownership. LLM consumption is derived from agent token telemetry unless a manual
 * "LLM/API tokens" cost item exists, in which case the manual figure wins (no double count).
 * Multipliers support scenario analysis.
 */
export function computeTco(
  costs: CostItem[],
  agents: AiAgent[],
  prices: ModelPrice[],
  opts: { recurringMultiplier?: number; oneTimeMultiplier?: number; llmVolumeMultiplier?: number } = {},
): TcoResult {
  const rm = opts.recurringMultiplier ?? 1;
  const om = opts.oneTimeMultiplier ?? 1;
  const vm = opts.llmVolumeMultiplier ?? 1;
  const notes: string[] = [];

  const lines: TcoLine[] = costs.map((c) => ({
    category: c.category,
    subcategory: c.subcategory,
    recurrence: c.recurrence,
    amount: c.amount * (c.recurrence === "ONE_TIME" ? om : rm),
    derived: false,
  }));

  const hasManualTokens = costs.some((c) => c.subcategory === "LLM/API tokens" && c.recurrence === "RECURRING");
  const llm = annualLlmCostForAgents(agents, prices) * rm * vm;
  if (!hasManualTokens && llm > 0) {
    lines.push({ category: "TECHNOLOGY", subcategory: "LLM/API tokens", recurrence: "RECURRING", amount: llm, derived: true });
    notes.push("LLM/API token cost derived from agent telemetry × configured model prices.");
  } else if (hasManualTokens) {
    notes.push("Manual LLM/API token cost item used; derived token cost ignored to avoid double counting.");
  }
  if (prices.some((p) => p.isIllustrative)) notes.push("Model prices are illustrative placeholders until contracted rates are configured.");

  const oneTimeTotal = sum(lines.filter((l) => l.recurrence === "ONE_TIME").map((l) => l.amount));
  const recurringTotal = sum(lines.filter((l) => l.recurrence === "RECURRING").map((l) => l.amount));

  const byCategory = {
    IMPLEMENTATION: { oneTime: 0, recurring: 0 },
    TECHNOLOGY: { oneTime: 0, recurring: 0 },
    OPERATING: { oneTime: 0, recurring: 0 },
  } as TcoResult["byCategory"];
  for (const l of lines) byCategory[l.category][l.recurrence === "ONE_TIME" ? "oneTime" : "recurring"] += l.amount;

  const oneTime = metric({
    key: "oneTimeInvestment",
    label: "One-time investment",
    value: oneTimeTotal,
    unit: "currency",
    definition: "Implementation and set-up costs incurred once.",
    formula: "Σ one-time cost items",
    inputs: lines.filter((l) => l.recurrence === "ONE_TIME").map((l) => ({ name: `${l.category} · ${l.subcategory}`, value: l.amount, unit: "currency" as const })),
    assumptions: om !== 1 ? [`Scenario multiplier ×${fmt(om)} applied.`] : [],
  });
  const recurring = metric({
    key: "recurringAnnualCost",
    label: "Recurring annual AI cost",
    value: recurringTotal,
    unit: "currency",
    definition: "Annual technology and operating cost to run the AI solution.",
    formula: "Σ recurring technology + operating items (+ derived LLM token cost)",
    inputs: lines
      .filter((l) => l.recurrence === "RECURRING")
      .map((l) => ({ name: `${l.category} · ${l.subcategory}${l.derived ? " (derived)" : ""}`, value: l.amount, unit: "currency" as const })),
    assumptions: [...notes, ...(rm !== 1 ? [`Scenario multiplier ×${fmt(rm)} applied to recurring cost.`] : [])],
  });

  return {
    lines,
    oneTime,
    recurring,
    derivedLlmAnnual: hasManualTokens ? 0 : llm,
    byCategory,
    tcoOverHorizon: (years: number) => oneTimeTotal + recurringTotal * years,
    notes,
  };
}
