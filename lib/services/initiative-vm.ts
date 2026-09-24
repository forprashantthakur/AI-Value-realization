import type { ComparisonRow } from "@/components/value/comparison-table";
import type { TreeNode } from "@/components/value/value-tree";
import type { Benchmark, Initiative, ProcessMetrics } from "../domain/types";
import { CLASS_LABEL } from "../domain/labels";
import { countsInRoi, type InitiativeValue } from "../value-engine";
import type { RoiBasis } from "../domain/types";
import { hoursLabel, money, num, pct } from "../format";

const rel = (b: number, a: number) => (b ? (b - a) / b : 0);

export function comparisonRows(init: Initiative, v: InitiativeValue, benchmarks: Benchmark[] = []): ComparisonRow[] {
  const b = init.baseline.metrics;
  const t = init.target.metrics;
  const a = v.post;
  const bm = (metric: keyof ProcessMetrics, f: (n: number) => string) => {
    const x = benchmarks.find((k) => k.functionId === init.functionId && k.metric === metric);
    return x ? `${f(x.median)} / TQ ${f(x.topQuartile)}` : undefined;
  };
  const baseTxnPerFte = v.productivity.outputPerFteBaseline.value;
  return [
    { metric: "Cycle time", baseline: hoursLabel(b.cycleTimeHours), target: hoursLabel(t.cycleTimeHours), actual: hoursLabel(a.cycleTimeHours), improvement: pct(v.productivity.cycleTime.value), good: v.productivity.cycleTime.value > 0, explain: v.productivity.cycleTime, benchmark: bm("cycleTimeHours", (n) => hoursLabel(n)) },
    { metric: "Touch time (AHT)", baseline: `${b.avgHandlingMinutes.toFixed(1)} min`, target: `${t.avgHandlingMinutes.toFixed(1)} min`, actual: `${a.avgHandlingMinutes.toFixed(1)} min`, improvement: pct(v.productivity.touchTime.value), good: v.productivity.touchTime.value > 0, explain: v.productivity.touchTime, benchmark: bm("avgHandlingMinutes", (n) => `${n} min`) },
    { metric: "Cost / transaction", baseline: money(v.cost.perTxnBaseline.value, { compact: false }), actual: money(v.cost.perTxnPost.value, { compact: false }), improvement: pct(v.cost.reduction.value), good: v.cost.reduction.value > 0, explain: v.cost.reduction },
    { metric: "Error rate", baseline: pct(b.errorRate, 1), target: pct(t.errorRate, 1), actual: pct(a.errorRate, 1), improvement: pct(v.quality.errorReduction.value), good: v.quality.errorReduction.value > 0, explain: v.quality.errorReduction, benchmark: bm("errorRate", (n) => pct(n, 1)) },
    { metric: "Rework rate", baseline: pct(b.reworkRate, 1), target: pct(t.reworkRate, 1), actual: pct(a.reworkRate, 1), improvement: pct(v.quality.reworkReduction.value), good: v.quality.reworkReduction.value > 0, explain: v.quality.reworkReduction },
    { metric: "First-time-right", baseline: pct(b.firstTimeRight), target: pct(t.firstTimeRight), actual: pct(a.firstTimeRight), improvement: `${(v.quality.ftr.value * 100).toFixed(1)} pts`, good: v.quality.ftr.value > 0, explain: v.quality.ftr, benchmark: bm("firstTimeRight", (n) => pct(n)) },
    { metric: "SLA achievement", baseline: pct(b.slaAchievement), target: pct(t.slaAchievement), actual: pct(a.slaAchievement), improvement: `${(v.quality.sla.value * 100).toFixed(1)} pts`, good: v.quality.sla.value > 0, explain: v.quality.sla },
    { metric: "FTE requirement", baseline: v.capacity.baselineRequiredFte.value.toFixed(1), actual: v.capacity.postRequiredFte.value.toFixed(1), improvement: pct(rel(v.capacity.baselineRequiredFte.value, v.capacity.postRequiredFte.value)), good: true, explain: v.capacity.fteCapacityReleased },
    { metric: "Transactions / FTE", baseline: num(baseTxnPerFte), actual: num(v.productivity.outputPerFtePost.value), improvement: pct(v.productivity.uplift.value), good: v.productivity.uplift.value > 0, explain: v.productivity.uplift },
    { metric: "Automation rate", baseline: pct(b.automationRate), target: pct(t.automationRate), actual: pct(a.automationRate), improvement: `${((a.automationRate - b.automationRate) * 100).toFixed(0)} pts`, good: a.automationRate > b.automationRate, explain: v.productivity.automation },
  ];
}

/** EBITDA → financial classes → drivers → operational KPIs → agents. */
export function buildValueTree(init: Initiative, v: InitiativeValue, basis: RoiBasis): TreeNode {
  const agents: TreeNode[] = init.agents.map((a) => ({
    id: a.id,
    label: a.name,
    value: `${pct(a.status === "LIVE" ? a.performance.autonomousCompletionRate : a.automationPct)} ${a.status === "LIVE" ? "autonomous" : "designed"}`,
    sub: `${num(a.performance.tasksPerMonth)} tasks/mo · ${a.humanInLoopModel.replaceAll("_", " ").toLowerCase()}`,
    tone: "agent",
  }));
  const automationNode: TreeNode = {
    id: "automation",
    label: "Process automation & AI-path adoption",
    value: `${pct(v.post.automationRate)} touchless · ${pct(v.post.adoptionRate)} adopted`,
    metric: v.productivity.automation,
    tone: "operational",
    children: agents,
  };
  const handling: TreeNode = {
    id: "aht",
    label: "Reduced handling & rework effort",
    value: `${v.baseline.avgHandlingMinutes.toFixed(1)} → ${v.post.avgHandlingMinutes.toFixed(1)} min`,
    sub: `Touch time −${pct(v.productivity.touchTime.value)}, rework −${pct(v.quality.reworkReduction.value)}`,
    metric: v.productivity.touchTime,
    tone: "operational",
    children: [automationNode],
  };
  const capacity: TreeNode = {
    id: "capacity",
    label: "Higher employee capacity",
    value: `${v.capacity.fteCapacityReleased.value.toFixed(1)} FTE`,
    sub: `${num(v.capacity.hoursReleased.value)} hours/yr released`,
    metric: v.capacity.fteCapacityReleased,
    tone: "operational",
    children: [
      { id: "throughput", label: "Higher throughput capacity", value: pct(v.productivity.throughput.value), metric: v.productivity.throughput, tone: "operational", children: [handling] },
    ],
  };
  const quality: TreeNode = {
    id: "quality",
    label: "Fewer errors",
    value: `${pct(v.baseline.errorRate, 1)} → ${pct(v.post.errorRate, 1)}`,
    metric: v.quality.errorReduction,
    tone: "operational",
    children: [automationNode],
  };
  const lines: TreeNode[] = v.benefits
    .filter((b) => b.benefit.financialClass !== "NON_FINANCIAL")
    .map((b) => {
      const src = b.benefit.source;
      const driver =
        src.kind === "DERIVED"
          ? src.driver.startsWith("LABOR")
            ? [capacity]
            : src.driver === "QUALITY_COST"
              ? [quality]
              : [automationNode]
          : [{ id: `${b.benefit.id}-decl`, label: "Owner-declared driver", value: "", sub: src.basis, tone: "operational" as const }];
      const counted = countsInRoi(b.benefit.financialClass, basis);
      return {
        id: b.benefit.id,
        label: `${b.benefit.name}`,
        value: money(b.attributed),
        sub: `${CLASS_LABEL[b.benefit.financialClass]} · ${pct(b.attributionPct)} attributed${counted ? "" : " · excluded from ROI"}`,
        metric: b.metric,
        tone: counted ? ("financial" as const) : ("capacity" as const),
        children: driver,
      };
    });
  const costPerTxn: TreeNode = {
    id: "cpt",
    label: "Lower cost per transaction",
    value: `${money(v.cost.perTxnBaseline.value, { compact: false })} → ${money(v.cost.perTxnPost.value, { compact: false })}`,
    metric: v.cost.reduction,
    tone: "financial",
    children: lines,
  };
  return {
    id: "root",
    label: "Operating profit (EBITDA) impact — net annual",
    value: money(v.roi.netAnnualBenefit.value),
    sub: `Gross ${money(v.totals.counted)} − AI run cost ${money(v.tco.recurring.value)}`,
    metric: v.roi.netAnnualBenefit,
    tone: "financial",
    children: [
      costPerTxn,
      { id: "aicost", label: "AI operating cost", value: `−${money(v.tco.recurring.value)}`, metric: v.tco.recurring, tone: "cost" },
    ],
  };
}
