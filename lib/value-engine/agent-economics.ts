import type { AgentPerformance, AiAgent, ModelPrice } from "../domain/types";
import { fmt, metric, pct, type Metric } from "./metric";
import { safeDiv, sum } from "./units";

export interface TokenCostInput {
  inputTokensPerCall: number;
  outputTokensPerCall: number;
  callsPerTask: number;
  cacheHitRate: number;
  price: Pick<ModelPrice, "inputPer1M" | "outputPer1M" | "cachedInputPer1M">;
}

/** Model consumption cost for one call. Cached input tokens are billed at the cached rate. */
export function costPerCall(i: TokenCostInput): number {
  const freshIn = i.inputTokensPerCall * (1 - i.cacheHitRate);
  const cachedIn = i.inputTokensPerCall * i.cacheHitRate;
  return (
    (freshIn * i.price.inputPer1M + cachedIn * i.price.cachedInputPer1M + i.outputTokensPerCall * i.price.outputPer1M) /
    1_000_000
  );
}

export function costPerTask(i: TokenCostInput): number {
  return costPerCall(i) * i.callsPerTask;
}

export interface AgentEconomics {
  agentId: string;
  agentName: string;
  priceConfigured: boolean;
  tokensPerTask: number;
  aiCostPerTask: Metric;
  monthlyLlmCost: Metric;
  annualLlmCost: Metric;
  humanHoursPerMonth: Metric;
  humanInterventionCostMonthly: Metric;
  costPerOutcome: Metric;
  reliability: Metric;
  completedTasksPerMonth: number;
  autonomousTasksPerMonth: number;
}

function perfTokenInput(p: AgentPerformance, price: ModelPrice): TokenCostInput {
  return {
    inputTokensPerCall: p.inputTokensPerCall,
    outputTokensPerCall: p.outputTokensPerCall,
    callsPerTask: p.callsPerTask,
    cacheHitRate: p.cacheHitRate,
    price,
  };
}

/**
 * Connects agent operating performance to economics: escalations turn into human hours,
 * which turn into cost that erodes realized value.
 */
export function computeAgentEconomics(agent: AiAgent, price: ModelPrice | undefined, hourlyCost: number): AgentEconomics {
  const p = agent.performance;
  const priceConfigured = !!price;
  const unitCost = price ? costPerTask(perfTokenInput(p, price)) : 0;
  const tokensPerTask = p.callsPerTask * (p.inputTokensPerCall + p.outputTokensPerCall);
  const monthly = unitCost * p.tasksPerMonth;
  const humanHours = (p.tasksPerMonth * p.escalationRate * p.humanMinutesPerEscalation) / 60;
  const humanCost = humanHours * hourlyCost;
  const completed = p.tasksPerMonth * p.taskCompletionRate;
  const outcomeCost = safeDiv(monthly + humanCost, completed);
  const reliability = p.taskCompletionRate * p.toolCallSuccessRate * (1 - p.errorRate);
  const priceNote = price
    ? `Model price "${price.name}" (${price.isIllustrative ? "ILLUSTRATIVE placeholder — configure contracted rates" : "configured"}).`
    : "No model price configured — token cost shown as 0.";

  const aiCostPerTask = metric({
    key: "aiCostPerTask",
    label: "AI cost per task",
    value: unitCost,
    unit: "currency",
    definition: "Model consumption cost for one agent task (all LLM calls).",
    formula:
      "Calls/task × [Input tokens × (1 − cache) × Price_in + Input tokens × cache × Price_cached + Output tokens × Price_out] ÷ 1,000,000",
    inputs: [
      { name: "Calls per task", value: p.callsPerTask, unit: "count" },
      { name: "Input tokens / call", value: p.inputTokensPerCall, unit: "tokens" },
      { name: "Output tokens / call", value: p.outputTokensPerCall, unit: "tokens" },
      { name: "Cache hit rate", value: p.cacheHitRate, unit: "percent" },
      { name: "Price / 1M input", value: price?.inputPer1M ?? 0, unit: "currency" },
      { name: "Price / 1M cached input", value: price?.cachedInputPer1M ?? 0, unit: "currency" },
      { name: "Price / 1M output", value: price?.outputPer1M ?? 0, unit: "currency" },
    ],
    assumptions: [priceNote, "Tool-call execution cost is in platform run cost, not token cost."],
    example: `${fmt(p.callsPerTask)} calls × … = ${fmt(unitCost, 3)} per task`,
  });

  const monthlyLlmCost = metric({
    key: "monthlyLlmCost",
    label: "Monthly LLM cost",
    value: monthly,
    unit: "currency",
    definition: "Model consumption cost per month for this agent.",
    formula: "AI cost per task × Tasks per month",
    inputs: [
      { name: "AI cost per task", value: unitCost, unit: "currency" },
      { name: "Tasks per month", value: p.tasksPerMonth, unit: "count" },
    ],
    assumptions: [priceNote],
    example: `${fmt(unitCost, 3)} × ${fmt(p.tasksPerMonth)} = ${fmt(monthly)}`,
  });

  const annualLlmCost = metric({
    ...monthlyLlmCost,
    key: "annualLlmCost",
    label: "Annual LLM cost",
    value: monthly * 12,
    formula: "Monthly LLM cost × 12",
    example: `${fmt(monthly)} × 12 = ${fmt(monthly * 12)}`,
  });

  const humanHoursPerMonth = metric({
    key: "humanHoursPerMonth",
    label: "Human intervention hours / month",
    value: humanHours,
    unit: "hours",
    definition: "Human effort spent on tasks the agent escalates.",
    formula: "Tasks/month × Escalation rate × Human minutes per escalation ÷ 60",
    inputs: [
      { name: "Tasks per month", value: p.tasksPerMonth, unit: "count" },
      { name: "Escalation rate", value: p.escalationRate, unit: "percent" },
      { name: "Minutes per escalation", value: p.humanMinutesPerEscalation, unit: "minutes" },
    ],
    assumptions: ["This effort is already inside post-AI measured handling time; shown here to explain it, not added again."],
    example: `${fmt(p.tasksPerMonth)} × ${pct(p.escalationRate)} × ${fmt(p.humanMinutesPerEscalation)} ÷ 60 = ${fmt(humanHours)} h`,
  });

  const humanInterventionCostMonthly = metric({
    key: "humanInterventionCostMonthly",
    label: "Human intervention cost / month",
    value: humanCost,
    unit: "currency",
    definition: "Cost of human effort on escalated tasks.",
    formula: "Human intervention hours × Loaded hourly cost",
    inputs: [
      { name: "Human hours / month", value: humanHours, unit: "hours" },
      { name: "Loaded hourly cost", value: hourlyCost, unit: "currency" },
    ],
    assumptions: ["Embedded in post-AI labour hours — do not add to TCO."],
    example: `${fmt(humanHours)} × ${fmt(hourlyCost)} = ${fmt(humanCost)}`,
  });

  const costPerOutcome = metric({
    key: "costPerOutcome",
    label: "Cost per completed outcome",
    value: outcomeCost,
    unit: "currency",
    definition: "All-in cost (model + human intervention) per successfully completed task.",
    formula: "(Monthly LLM cost + Human intervention cost) ÷ Completed tasks",
    inputs: [
      { name: "Monthly LLM cost", value: monthly, unit: "currency" },
      { name: "Human intervention cost", value: humanCost, unit: "currency" },
      { name: "Completed tasks / month", value: completed, unit: "count" },
    ],
    assumptions: [],
    example: `(${fmt(monthly)} + ${fmt(humanCost)}) ÷ ${fmt(completed)} = ${fmt(outcomeCost, 2)}`,
  });

  const reliabilityMetric = metric({
    key: "reliability",
    label: "Agent reliability index",
    value: reliability,
    unit: "percent",
    definition:
      "Simple multiplicative index of task completion, tool-call success and error-free output. A heuristic indicator, not a statistical reliability measure.",
    formula: "Task completion rate × Tool-call success rate × (1 − Agent error rate)",
    inputs: [
      { name: "Task completion", value: p.taskCompletionRate, unit: "percent" },
      { name: "Tool-call success", value: p.toolCallSuccessRate, unit: "percent" },
      { name: "Agent error rate", value: p.errorRate, unit: "percent" },
    ],
    assumptions: ["Factors treated as independent."],
    example: `${pct(p.taskCompletionRate)} × ${pct(p.toolCallSuccessRate)} × ${pct(1 - p.errorRate)} = ${pct(reliability)}`,
  });

  return {
    agentId: agent.id,
    agentName: agent.name,
    priceConfigured,
    tokensPerTask,
    aiCostPerTask,
    monthlyLlmCost,
    annualLlmCost,
    humanHoursPerMonth,
    humanInterventionCostMonthly,
    costPerOutcome,
    reliability: reliabilityMetric,
    completedTasksPerMonth: completed,
    autonomousTasksPerMonth: p.tasksPerMonth * p.autonomousCompletionRate,
  };
}

/**
 * Sensitivity: annual human cost added if the escalation rate rises by `deltaRate` (absolute).
 * Used to show how agent performance degrades realized ROI.
 */
export function escalationSensitivity(agent: AiAgent, hourlyCost: number, deltaRate: number): number {
  const p = agent.performance;
  return ((p.tasksPerMonth * deltaRate * p.humanMinutesPerEscalation) / 60) * hourlyCost * 12;
}

export function annualLlmCostForAgents(agents: AiAgent[], prices: ModelPrice[]): number {
  return sum(
    agents.map((a) => {
      const price = prices.find((m) => m.id === a.modelPriceId);
      if (!price) return 0;
      return costPerTask(perfTokenInput(a.performance, price)) * a.performance.tasksPerMonth * 12;
    }),
  );
}
