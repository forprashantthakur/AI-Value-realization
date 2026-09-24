"use client";
import { useMemo, useState } from "react";
import type { AppSettings, Initiative, ModelPrice, ScenarioName, ScenarioOverrides } from "@/lib/domain/types";
import { defaultScenario, evaluateInitiative, summarizePortfolio } from "@/lib/value-engine";
import { Slider } from "@/components/ui/misc";
import { BarsChart } from "@/components/charts/charts";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Knobs {
  adoptionDelta: number;
  automationScale: number;
  volume: number;
  fteCost: number;
  aiCost: number;
  implCost: number;
  attribution: number | null;
}
const ZERO: Knobs = { adoptionDelta: 0, automationScale: 1, volume: 0, fteCost: 0, aiCost: 0, implCost: 0, attribution: null };

function overridesFor(i: Initiative, k: Knobs): ScenarioOverrides {
  const src = i.actual?.metrics ?? i.target.metrics;
  const ai = src.adoptionRate ? src.automationRate / src.adoptionRate : 0;
  const o: ScenarioOverrides = {};
  if (k.adoptionDelta) o.adoptionPct = Math.min(1, Math.max(0, src.adoptionRate + k.adoptionDelta));
  if (k.automationScale !== 1) o.automationPct = Math.min(1, ai * k.automationScale);
  if (k.volume) o.volumeChangePct = k.volume;
  if (k.fteCost) o.fteCostChangePct = k.fteCost;
  if (k.aiCost) o.aiCostChangePct = k.aiCost;
  if (k.implCost) o.implementationCostChangePct = k.implCost;
  if (k.attribution !== null) o.attributionPct = k.attribution;
  return o;
}

export function PortfolioScenarioLab({ initiatives, settings, modelPrices }: { initiatives: Initiative[]; settings: AppSettings; modelPrices: ModelPrice[] }) {
  const [k, setK] = useState<Knobs>(ZERO);
  const ctx = useMemo(() => ({ settings, modelPrices }), [settings, modelPrices]);
  const live = useMemo(() => initiatives.filter((i) => i.actual), [initiatives]);
  const run = (fn: (i: Initiative) => ScenarioOverrides | undefined) => summarizePortfolio(live.map((init) => ({ init, value: evaluateInitiative(init, ctx, fn(init)) })), settings);
  const presets = useMemo(() => {
    const pick = (n: ScenarioName) => (i: Initiative) => i.scenarios.find((s) => s.name === n)?.overrides ?? (n === "EXPECTED" ? undefined : defaultScenario(i, n));
    return {
      CONSERVATIVE: run(pick("CONSERVATIVE")),
      EXPECTED: run(() => undefined),
      AGGRESSIVE: run(pick("AGGRESSIVE")),
    };
  }, [live, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const custom = useMemo(() => run((i) => overridesFor(i, k)), [live, ctx, k]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = [
    ["Conservative", presets.CONSERVATIVE],
    ["Expected (measured)", presets.EXPECTED],
    ["Aggressive", presets.AGGRESSIVE],
    ["Custom what-if", custom],
  ] as const;
  const rows: [string, (s: (typeof cols)[number][1]) => string][] = [
    ["Gross annual benefit", (s) => money(s.grossBenefit.value)],
    ["Recurring AI cost", (s) => money(s.recurringCost.value)],
    ["Net annual benefit", (s) => money(s.netBenefit.value)],
    ["One-time investment", (s) => money(s.oneTimeInvestment.value)],
    [`ROI (${settings.horizonYears}-yr)`, (s) => pct(s.roi.roi.value)],
    ["NPV", (s) => money(s.roi.npv.value)],
    ["Payback", (s) => (s.roi.paybackMonths.undefinedReason ? "n/a" : `${s.roi.paybackMonths.value.toFixed(1)} mo`)],
    ["FTE capacity released", (s) => s.fteReleased.value.toFixed(0)],
    ["AI adoption", (s) => pct(s.adoption.value)],
  ];
  const knob = (key: keyof Knobs, label: string, min: number, max: number, step: number, fmt: (v: number) => string, dflt: number) => {
    const v = (k[key] ?? dflt) as number;
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className={cn(k[key] !== ZERO[key] ? "font-medium" : "text-muted-foreground")}>{label}</span>
          <span className="tabular">{fmt(v)}</span>
        </div>
        <Slider min={min} max={max} step={step} value={[v]} aria-label={label} onValueChange={([x]) => setK({ ...k, [key]: x })} />
      </div>
    );
  };
  const sign = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <div className="space-y-3 rounded-lg border p-3">
        <p className="section-title">Custom what-if (all live initiatives)</p>
        {knob("adoptionDelta", "Adoption change (pts)", -0.5, 0.3, 0.01, (v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)} pts`, 0)}
        {knob("automationScale", "Automation (× current)", 0.5, 1.5, 0.01, (v) => `×${v.toFixed(2)}`, 1)}
        {knob("volume", "Volume", -0.5, 1, 0.01, sign, 0)}
        {knob("fteCost", "FTE cost", -0.3, 0.5, 0.01, sign, 0)}
        {knob("aiCost", "AI run cost", -0.5, 1.5, 0.01, sign, 0)}
        {knob("implCost", "Implementation cost", -0.5, 1, 0.01, sign, 0)}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className={cn(k.attribution !== null ? "font-medium" : "text-muted-foreground")}>Attribution override</span>
            <span className="tabular">{k.attribution === null ? "as recorded" : pct(k.attribution)}</span>
          </div>
          <Slider min={0} max={1} step={0.01} value={[k.attribution ?? 0.7]} aria-label="Attribution override" onValueChange={([x]) => setK({ ...k, attribution: x })} />
        </div>
        <button onClick={() => setK(ZERO)} className="text-xs text-primary hover:underline">
          Reset
        </button>
      </div>
      <div className="space-y-3">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs tabular">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Portfolio metric</th>
                {cols.map(([n]) => (
                  <th key={n} className={cn("px-3 py-2 text-right font-medium", n === "Custom what-if" ? "text-primary" : "text-muted-foreground")}>
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, f]) => (
                <tr key={label} className="border-t">
                  <td className="px-3 py-1.5">{label}</td>
                  {cols.map(([n, s]) => (
                    <td key={n} className={cn("px-3 py-1.5 text-right", n === "Custom what-if" && "font-semibold")}>
                      {f(s)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <BarsChart
          data={cols.map(([n, s]) => ({ name: n, benefit: s.grossBenefit.value, cost: s.recurringCost.value, net: s.netBenefit.value }))}
          xKey="name"
          series={[
            { key: "benefit", label: "Gross / yr", color: "#2a78d6" },
            { key: "cost", label: "AI run cost / yr", color: "#e34948" },
            { key: "net", label: "Net / yr", color: "#1baf7a" },
          ]}
          height={240}
        />
        <p className="text-[11px] text-muted-foreground">
          Presets use each initiative&apos;s saved scenario (or a documented default: conservative = adoption −15 pts, automation ×0.85, AI cost +25%, implementation +15%; aggressive = adoption +10 pts, automation ×1.1, volume +10%, AI cost −10%). All recalculated live by the value engine in your browser.
        </p>
      </div>
    </div>
  );
}
