import { fmt, metric, pct, undefinedMetric, type Metric } from "./metric";
import { irr, npv, presentValue } from "./npv";
import { safeDiv, sum } from "./units";

export interface RoiInput {
  /** Attributed annual run-rate of benefits counted under the ROI basis. */
  annualBenefit: number;
  /** One-time investment incurred at year 0. */
  oneTimeInvestment: number;
  /** Recurring annual AI cost (technology + operating). */
  recurringAnnualCost: number;
  discountRate: number;
  horizonYears: number;
  /** Benefit ramp as share of run-rate by year (missing years = 100%). */
  rampUp: number[];
}

export interface CashFlowYear {
  year: number;
  benefit: number;
  cost: number;
  net: number;
  cumulative: number;
  discountedNet: number;
}

export interface RoiResult {
  schedule: CashFlowYear[];
  grossAnnualBenefit: Metric;
  netAnnualBenefit: Metric;
  totalInvestment: Metric;
  recurringCost: Metric;
  totalBenefits: Metric;
  totalCosts: Metric;
  roi: Metric;
  paybackMonths: Metric;
  cumulativePaybackMonths: Metric;
  npv: Metric;
  irr: Metric;
  benefitCostRatio: Metric;
  value3y: Metric;
  value5y: Metric;
  npv3y: number;
  npv5y: number;
}

export function buildSchedule(input: RoiInput, years: number): CashFlowYear[] {
  const rows: CashFlowYear[] = [];
  let cumulative = -input.oneTimeInvestment;
  rows.push({
    year: 0,
    benefit: 0,
    cost: input.oneTimeInvestment,
    net: -input.oneTimeInvestment,
    cumulative,
    discountedNet: -input.oneTimeInvestment,
  });
  for (let y = 1; y <= years; y++) {
    const ramp = input.rampUp[y - 1] ?? 1;
    const benefit = input.annualBenefit * ramp;
    const cost = input.recurringAnnualCost;
    const net = benefit - cost;
    cumulative += net;
    rows.push({ year: y, benefit, cost, net, cumulative, discountedNet: net / (1 + input.discountRate) ** y });
  }
  return rows;
}

function cumulativePayback(schedule: CashFlowYear[]): number | null {
  for (let i = 1; i < schedule.length; i++) {
    const prev = schedule[i - 1];
    const cur = schedule[i];
    if (prev.cumulative < 0 && cur.cumulative >= 0) {
      const fraction = safeDiv(-prev.cumulative, cur.net, 0);
      return (i - 1 + fraction) * 12;
    }
  }
  return schedule.length && schedule[0].cumulative >= 0 ? 0 : null;
}

export function computeRoi(input: RoiInput): RoiResult {
  const H = input.horizonYears;
  const schedule = buildSchedule(input, Math.max(H, 5));
  const horizon = schedule.slice(0, H + 1);
  const flows = horizon.map((r) => r.net);

  const totalBenefits = sum(horizon.map((r) => r.benefit));
  const totalCosts = sum(horizon.map((r) => r.cost));
  const net = totalBenefits - totalCosts;
  const rampTxt = input.rampUp.length
    ? `Benefit ramp by year: ${input.rampUp.map((r) => pct(r, 0)).join(", ")}; later years 100%.`
    : "No ramp-up applied.";
  const commonAssumptions = [
    `Horizon ${H} years; one-time investment at year 0; recurring costs from year 1.`,
    rampTxt,
    "Benefits are attributed to AI and limited to the configured ROI basis (financial classes).",
    "Capacity that is merely redeployed is excluded from financial benefit.",
  ];

  const annualNet = input.annualBenefit - input.recurringAnnualCost;
  const monthlyNet = annualNet / 12;

  const grossAnnualBenefit = metric({
    key: "grossAnnualBenefit",
    label: "Gross annual benefit (run-rate)",
    value: input.annualBenefit,
    unit: "currency",
    definition: "Annual run-rate of AI-attributed financial benefits under the configured ROI basis.",
    formula: "Σ (benefit line gross value × AI attribution %) for counted financial classes",
    inputs: [{ name: "Attributed annual benefit", value: input.annualBenefit, unit: "currency" }],
    assumptions: commonAssumptions,
  });

  const netAnnualBenefit = metric({
    key: "netAnnualBenefit",
    label: "Net annual benefit",
    value: annualNet,
    unit: "currency",
    definition: "Run-rate benefit after recurring AI operating and technology costs.",
    formula: "Gross annual benefit − Recurring annual AI cost",
    inputs: [
      { name: "Gross annual benefit", value: input.annualBenefit, unit: "currency" },
      { name: "Recurring annual AI cost", value: input.recurringAnnualCost, unit: "currency" },
    ],
    assumptions: commonAssumptions,
    example: `${fmt(input.annualBenefit)} − ${fmt(input.recurringAnnualCost)} = ${fmt(annualNet)}`,
  });

  const totalInvestment = metric({
    key: "totalInvestment",
    label: "One-time investment",
    value: input.oneTimeInvestment,
    unit: "currency",
    definition: "Implementation cost incurred once (consulting, build, integration, change, training).",
    formula: "Σ one-time cost items",
    inputs: [{ name: "One-time cost", value: input.oneTimeInvestment, unit: "currency" }],
    assumptions: [],
  });

  const recurringCost = metric({
    key: "recurringCost",
    label: "Recurring annual AI cost",
    value: input.recurringAnnualCost,
    unit: "currency",
    definition: "Annual technology and operating cost to run the AI solution, including model consumption.",
    formula: "Σ recurring technology + operating cost items (+ derived LLM consumption)",
    inputs: [{ name: "Recurring cost", value: input.recurringAnnualCost, unit: "currency" }],
    assumptions: [],
  });

  const tb = metric({
    key: "totalBenefits",
    label: `Total benefits (${H}-year)`,
    value: totalBenefits,
    unit: "currency",
    definition: "Undiscounted benefits over the horizon after ramp-up.",
    formula: "Σₜ Annual benefit × Ramp(t)",
    inputs: horizon.slice(1).map((r) => ({ name: `Year ${r.year}`, value: r.benefit, unit: "currency" as const })),
    assumptions: commonAssumptions,
  });
  const tc = metric({
    key: "totalCosts",
    label: `Total costs (${H}-year)`,
    value: totalCosts,
    unit: "currency",
    definition: "Undiscounted one-time plus recurring costs over the horizon.",
    formula: "One-time investment + Σₜ Recurring cost",
    inputs: horizon.map((r) => ({ name: `Year ${r.year}`, value: r.cost, unit: "currency" as const })),
    assumptions: commonAssumptions,
  });

  const roiBase = {
    key: "roi",
    label: `ROI (${H}-year)`,
    unit: "percent" as const,
    definition: "Return on AI investment over the horizon, undiscounted.",
    formula: "(Total benefits − Total costs) ÷ Total costs × 100",
    inputs: [
      { name: "Total benefits", value: totalBenefits, unit: "currency" as const },
      { name: "Total costs", value: totalCosts, unit: "currency" as const },
    ],
    assumptions: commonAssumptions,
  };
  const roi =
    totalCosts > 0
      ? metric({
          ...roiBase,
          value: net / totalCosts,
          example: `(${fmt(totalBenefits)} − ${fmt(totalCosts)}) ÷ ${fmt(totalCosts)} = ${pct(net / totalCosts)}`,
        })
      : undefinedMetric(roiBase, "No costs recorded.");

  const paybackBase = {
    key: "paybackMonths",
    label: "Payback period",
    unit: "months" as const,
    definition: "Months of steady-state net benefit needed to recover the one-time investment.",
    formula: "One-time investment ÷ Monthly net benefit",
    inputs: [
      { name: "One-time investment", value: input.oneTimeInvestment, unit: "currency" as const },
      { name: "Monthly net benefit", value: monthlyNet, unit: "currency" as const },
    ],
    assumptions: ["Simple payback on run-rate; ignores ramp-up and discounting. See cumulative payback for ramp-adjusted view."],
  };
  const paybackMonths =
    monthlyNet > 0
      ? metric({
          ...paybackBase,
          value: input.oneTimeInvestment / monthlyNet,
          example: `${fmt(input.oneTimeInvestment)} ÷ ${fmt(monthlyNet)} = ${fmt(input.oneTimeInvestment / monthlyNet, 1)} months`,
        })
      : undefinedMetric(paybackBase, "Monthly net benefit is not positive — the investment does not pay back.");

  const cp = cumulativePayback(schedule);
  const cumulativePaybackMonths =
    cp !== null
      ? metric({
          key: "cumulativePaybackMonths",
          label: "Payback (ramp-adjusted)",
          value: cp,
          unit: "months",
          definition: "Month in which cumulative net cash flow turns positive, including ramp-up.",
          formula: "Interpolated month where Σ net cash flow ≥ 0",
          inputs: schedule.map((r) => ({ name: `Cumulative Y${r.year}`, value: r.cumulative, unit: "currency" as const })),
          assumptions: commonAssumptions,
        })
      : undefinedMetric(
          {
            key: "cumulativePaybackMonths",
            label: "Payback (ramp-adjusted)",
            unit: "months",
            definition: "Month in which cumulative net cash flow turns positive, including ramp-up.",
            formula: "Interpolated month where Σ net cash flow ≥ 0",
            inputs: [],
            assumptions: commonAssumptions,
          },
          "Does not pay back within 5 years.",
        );

  const npvH = npv(input.discountRate, flows);
  const pv = presentValue(input.discountRate, flows);
  const npvMetric = metric({
    key: "npv",
    label: `NPV (${H}-year)`,
    value: npvH,
    unit: "currency",
    definition: "Net present value of AI net cash flows at the configured discount rate.",
    formula: "Σₜ Net cash flowₜ ÷ (1 + r)ᵗ, t = 0…H",
    inputs: [
      { name: "Discount rate r", value: input.discountRate, unit: "percent" },
      ...horizon.map((r, i) => ({ name: `Net Y${r.year} (PV ${fmt(pv[i])})`, value: r.net, unit: "currency" as const })),
    ],
    assumptions: [...commonAssumptions, "Year-end discounting convention."],
    example: horizon.map((r) => `${fmt(r.net)}/(1+${pct(input.discountRate, 0)})^${r.year}`).join(" + ") + ` = ${fmt(npvH)}`,
  });

  const irrV = irr(flows);
  const irrBase = {
    key: "irr",
    label: `IRR (${H}-year)`,
    unit: "percent" as const,
    definition: "Discount rate at which NPV of the net cash flows equals zero.",
    formula: "r such that Σₜ Net cash flowₜ ÷ (1 + r)ᵗ = 0",
    inputs: horizon.map((r) => ({ name: `Net Y${r.year}`, value: r.net, unit: "currency" as const })),
    assumptions: ["Solved numerically (bisection)."],
  };
  const irrMetric =
    irrV !== null ? metric({ ...irrBase, value: irrV }) : undefinedMetric(irrBase, "IRR undefined — cash flows do not change sign.");

  const pvBenefits = sum(horizon.map((r) => r.benefit / (1 + input.discountRate) ** r.year));
  const pvCosts = sum(horizon.map((r) => r.cost / (1 + input.discountRate) ** r.year));
  const bcrBase = {
    key: "benefitCostRatio",
    label: "Benefit-cost ratio",
    unit: "ratio" as const,
    definition: "Present value of benefits per unit of present value of cost.",
    formula: "PV(Benefits) ÷ PV(Costs)",
    inputs: [
      { name: "PV benefits", value: pvBenefits, unit: "currency" as const },
      { name: "PV costs", value: pvCosts, unit: "currency" as const },
    ],
    assumptions: commonAssumptions,
  };
  const benefitCostRatio =
    pvCosts > 0
      ? metric({ ...bcrBase, value: pvBenefits / pvCosts, example: `${fmt(pvBenefits)} ÷ ${fmt(pvCosts)} = ${fmt(pvBenefits / pvCosts)}` })
      : undefinedMetric(bcrBase, "No costs recorded.");

  const v3 = schedule[3]?.cumulative ?? 0;
  const v5 = schedule[5]?.cumulative ?? 0;
  const value3y = metric({
    key: "value3y",
    label: "3-year net value",
    value: v3,
    unit: "currency",
    definition: "Cumulative undiscounted net cash flow at the end of year 3.",
    formula: "Σₜ₌₀…₃ Net cash flowₜ",
    inputs: schedule.slice(0, 4).map((r) => ({ name: `Net Y${r.year}`, value: r.net, unit: "currency" as const })),
    assumptions: commonAssumptions,
  });
  const value5y = metric({
    key: "value5y",
    label: "5-year net value",
    value: v5,
    unit: "currency",
    definition: "Cumulative undiscounted net cash flow at the end of year 5.",
    formula: "Σₜ₌₀…₅ Net cash flowₜ",
    inputs: schedule.slice(0, 6).map((r) => ({ name: `Net Y${r.year}`, value: r.net, unit: "currency" as const })),
    assumptions: commonAssumptions,
  });

  return {
    schedule,
    grossAnnualBenefit,
    netAnnualBenefit,
    totalInvestment,
    recurringCost,
    totalBenefits: tb,
    totalCosts: tc,
    roi,
    paybackMonths,
    cumulativePaybackMonths,
    npv: npvMetric,
    irr: irrMetric,
    benefitCostRatio,
    value3y,
    value5y,
    npv3y: npv(input.discountRate, schedule.slice(0, 4).map((r) => r.net)),
    npv5y: npv(input.discountRate, schedule.slice(0, 6).map((r) => r.net)),
  };
}
