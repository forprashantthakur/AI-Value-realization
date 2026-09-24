import type { WaterfallStep } from "@/components/charts/charts";
import type { EvaluatedInitiative, InitiativeValue } from "../value-engine";
import { LEAKAGE_CAUSE_LABEL, countsInRoi, type LadderRung, type LeakageStep } from "../value-engine";
import type { RoiBasis } from "../domain/types";
import { sum } from "../value-engine/units";

export const VS_HEX = { forecast: "#9ec5f4", target: "#eda100", actual: "#2a78d6", validated: "#1baf7a", realized: "#008300", sustained: "#0d366b", potential: "#86b6ef" };

/** Value realization waterfall: Potential → Business case → drivers → Run-rate → Validated → Realized → Sustained. */
export function ladderWaterfall(
  ladder: Record<LadderRung, number>,
  byCause: Partial<Record<LeakageStep["cause"], number>>,
  forecastOnlyBusinessCase = 0,
): WaterfallStep[] {
  const c = (k: LeakageStep["cause"]) => byCause[k] ?? 0;
  const steps: WaterfallStep[] = [
    { label: "Potential", value: ladder.POTENTIAL, kind: "total", color: VS_HEX.potential },
    { label: "Plan < potential", value: c("ADOPTION_HEADROOM"), kind: "delta" },
    { label: "Business case", value: ladder.BUSINESS_CASE, kind: "total", color: VS_HEX.target },
  ];
  if (forecastOnlyBusinessCase) steps.push({ label: "Not yet live", value: -forecastOnlyBusinessCase, kind: "delta", color: "#c3c2b7" });
  for (const k of ["VOLUME_VARIANCE", "LOW_ADOPTION", "LOWER_AUTOMATION", "EXCEPTION_RATES", "DECLARED_VARIANCE"] as const) {
    if (Math.abs(c(k)) > 1) steps.push({ label: LEAKAGE_CAUSE_LABEL[k], value: c(k), kind: "delta" });
  }
  steps.push(
    { label: "Run-rate", value: ladder.CURRENT_RUN_RATE, kind: "total", color: VS_HEX.actual },
    { label: "Not validated", value: ladder.FINANCE_VALIDATED - ladder.CURRENT_RUN_RATE, kind: "delta" },
    { label: "Finance-validated", value: ladder.FINANCE_VALIDATED, kind: "total", color: VS_HEX.validated },
    { label: "Not yet realized", value: ladder.REALIZED - ladder.FINANCE_VALIDATED, kind: "delta" },
    { label: "Realized", value: ladder.REALIZED, kind: "total", color: VS_HEX.realized },
    { label: "Not yet sustained", value: ladder.SUSTAINED - ladder.REALIZED, kind: "delta" },
    { label: "Sustained", value: ladder.SUSTAINED, kind: "total", color: VS_HEX.sustained },
  );
  return steps;
}

export interface BridgeData {
  baselineCost: number;
  productivity: number;
  quality: number;
  avoidance: number;
  revenue: number;
  risk: number;
  aiRunCost: number;
  implAnnualized: number;
  netValue: number;
  postNetCost: number;
}

/** Executive value bridge (annual): baseline operating cost → benefits → AI costs → net. */
export function valueBridge(items: EvaluatedInitiative[], basis: RoiBasis, horizon: number): BridgeData {
  const L = items.filter((e) => e.init.actual);
  const byDriver = (v: InitiativeValue, pred: (b: InitiativeValue["benefits"][number]) => boolean) =>
    sum(v.benefits.filter((b) => countsInRoi(b.benefit.financialClass, basis)).filter(pred).map((b) => b.attributed));
  const baselineCost = sum(
    L.map((e) => e.value.capacity.baselineLaborHours.value * e.value.capacity.hourlyCost + e.value.baseline.technologyCostAnnual + e.value.baseline.outsourcingCostAnnual),
  );
  const productivity = sum(
    L.map((e) =>
      byDriver(e.value, (b) => b.benefit.source.kind === "DERIVED" && ["LABOR_CASHABLE", "OUTSOURCING", "LEGACY_TECH"].includes(b.benefit.source.driver)),
    ),
  );
  const quality = sum(L.map((e) => byDriver(e.value, (b) => b.benefit.source.kind === "DERIVED" && b.benefit.source.driver === "QUALITY_COST")));
  const avoidance = sum(L.map((e) => byDriver(e.value, (b) => b.benefit.source.kind === "DERIVED" && b.benefit.source.driver === "LABOR_COST_AVOIDANCE")));
  const revenue = sum(L.map((e) => byDriver(e.value, (b) => ["REVENUE", "WORKING_CAPITAL"].includes(b.benefit.financialClass))));
  const risk = sum(L.map((e) => byDriver(e.value, (b) => b.benefit.financialClass === "RISK_AVOIDANCE")));
  const declaredOther = sum(L.map((e) => byDriver(e.value, (b) => b.benefit.source.kind === "DECLARED" && ["CASHABLE", "COST_AVOIDANCE"].includes(b.benefit.financialClass))));
  const aiRunCost = sum(L.map((e) => e.value.tco.recurring.value));
  const implAnnualized = sum(L.map((e) => e.value.tco.oneTime.value)) / Math.max(1, horizon);
  const gross = productivity + quality + avoidance + revenue + risk + declaredOther;
  const netValue = gross - aiRunCost - implAnnualized;
  return {
    baselineCost,
    productivity: productivity + declaredOther,
    quality,
    avoidance,
    revenue,
    risk,
    aiRunCost,
    implAnnualized,
    netValue,
    postNetCost: baselineCost - netValue,
  };
}

export function bridgeSteps(b: BridgeData): WaterfallStep[] {
  return [
    { label: "Baseline operating cost", value: b.baselineCost, kind: "total", color: "#898781" },
    { label: "Productivity benefit", value: -b.productivity, kind: "delta", color: "#0ca30c" },
    { label: "Quality benefit", value: -b.quality, kind: "delta", color: "#0ca30c" },
    { label: "Cost avoidance", value: -b.avoidance, kind: "delta", color: "#0ca30c" },
    { label: "Revenue & WC benefit", value: -b.revenue, kind: "delta", color: "#0ca30c" },
    { label: "Risk avoidance", value: -b.risk, kind: "delta", color: "#0ca30c" },
    { label: "AI operating cost", value: b.aiRunCost, kind: "delta", color: "#d03b3b" },
    { label: "Implementation (annualized)", value: b.implAnnualized, kind: "delta", color: "#d03b3b" },
    { label: "Net cost after AI value", value: b.postNetCost, kind: "total", color: VS_HEX.actual },
  ];
}
