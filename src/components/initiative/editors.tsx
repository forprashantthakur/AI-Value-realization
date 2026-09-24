"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import type { AppSettings, CapacityDisposition, CostItem, Initiative, ModelPrice, ScenarioName, ScenarioOverrides } from "@/lib/domain/types";
import { COST_SUBCATEGORIES } from "@/lib/domain/types";
import { deleteCostAction, saveDispositionAction, saveScenarioAction, upsertCostAction } from "@/app/actions/initiative";
import { evaluateInitiative, splitCapacity, SCENARIO_LABEL, defaultScenario } from "@/lib/value-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/misc";
import { money, pct } from "@/lib/format";
import { BarsChart } from "@/components/charts/charts";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Capacity disposition
// ---------------------------------------------------------------------------
const DISP_FIELDS: { key: keyof Omit<CapacityDisposition, "rationale">; label: string; financial: boolean; help: string }[] = [
  { key: "cashable", label: "Cashable savings", financial: true, help: "Headcount/contractor/vendor spend actually removed from the P&L" },
  { key: "costAvoidance", label: "Cost avoidance", financial: true, help: "Future hiring or spend avoided (e.g. absorbed volume growth)" },
  { key: "redeployed", label: "Redeployed capacity", financial: false, help: "People moved to other work — valuable, not cash" },
  { key: "revenueProducing", label: "Revenue-producing capacity", financial: false, help: "Value only via a separately evidenced revenue line" },
  { key: "unallocated", label: "Unallocated", financial: false, help: "Capacity released with no committed use yet" },
];

export function DispositionEditor({ initiativeId, initial, hoursReleased, productiveHours, hourlyCost, canEdit }: { initiativeId: string; initial: CapacityDisposition; hoursReleased: number; productiveHours: number; hourlyCost: number; canEdit: boolean }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const total = d.cashable + d.costAvoidance + d.redeployed + d.revenueProducing + d.unallocated;
  const split = splitCapacity(hoursReleased, productiveHours, hourlyCost, d);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular">
          <thead>
            <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium">What happened to released capacity</th>
              <th className="w-24 py-1.5 font-medium">Share %</th>
              <th className="py-1.5 text-right font-medium">FTE</th>
              <th className="py-1.5 text-right font-medium">Economic value</th>
              <th className="py-1.5 text-right font-medium">Counts as money?</th>
            </tr>
          </thead>
          <tbody>
            {DISP_FIELDS.map((f) => {
              const s = split.find((x) => x.cls === f.key)!;
              return (
                <tr key={f.key} className="border-b">
                  <td className="py-1.5 pr-2">
                    <p className="font-medium">{f.label}</p>
                    <p className="text-[11px] text-muted-foreground">{f.help}</p>
                  </td>
                  <td className="py-1.5">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-8 w-20"
                      disabled={!canEdit}
                      aria-label={`${f.label} share`}
                      value={Math.round(d[f.key] * 1000) / 10}
                      onChange={(e) => setD({ ...d, [f.key]: Number(e.target.value) / 100 })}
                    />
                  </td>
                  <td className="py-1.5 text-right">{s.fte.toFixed(1)}</td>
                  <td className="py-1.5 text-right">{money(s.value)}</td>
                  <td className={cn("py-1.5 text-right font-medium", f.financial ? "text-[#006300]" : "text-muted-foreground")}>{f.financial ? "Yes" : "No"}</td>
                </tr>
              );
            })}
            <tr>
              <td className="py-1.5 font-medium">Total</td>
              <td className={cn("py-1.5 font-semibold", Math.abs(total - 1) > 0.001 ? "text-red-700" : "text-[#006300]")}>{(total * 100).toFixed(1)}%</td>
              <td className="py-1.5 text-right font-medium">{split.reduce((a, s) => a + s.fte, 0).toFixed(1)}</td>
              <td className="py-1.5 text-right font-medium">{money(split.reduce((a, s) => a + s.value, 0))}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="space-y-1">
        <Label htmlFor="rationale">Rationale (required)</Label>
        <Input id="rationale" value={d.rationale} disabled={!canEdit} onChange={(e) => setD({ ...d, rationale: e.target.value })} />
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={!canEdit || pending}
          onClick={() =>
            start(async () => {
              const r = await saveDispositionAction(initiativeId, d);
              setMsg(r.ok ? { ok: true, text: "Saved — benefits recalculated." } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save disposition
        </Button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-[#006300]" : "text-red-700")}>{msg.text}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------
export function CostEditor({ initiativeId, costs, canEdit }: { initiativeId: string; costs: CostItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [cat, setCat] = useState<CostItem["category"]>("TECHNOLOGY");
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular">
          <thead>
            <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 font-medium">Category</th>
              <th className="py-1.5 font-medium">Item</th>
              <th className="py-1.5 font-medium">Type</th>
              <th className="py-1.5 text-right font-medium">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {costs.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-1.5 text-muted-foreground">{c.category.toLowerCase()}</td>
                <td className="py-1.5">{c.subcategory}</td>
                <td className="py-1.5">{c.recurrence === "ONE_TIME" ? "One-time" : "Recurring / yr"}</td>
                <td className="py-1.5 text-right font-medium">{money(c.amount)}</td>
                <td className="py-1.5 text-right">
                  {canEdit && (
                    <button
                      className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-700"
                      aria-label={`Delete ${c.subcategory}`}
                      onClick={() =>
                        start(async () => {
                          const r = await deleteCostAction(initiativeId, c.id);
                          if (!r.ok) setErr(r.error);
                          else router.refresh();
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <form
          className="grid items-end gap-2 sm:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await upsertCostAction({ initiativeId, category: f.get("category"), subcategory: f.get("subcategory"), recurrence: f.get("recurrence"), amount: Number(f.get("amount")) });
              if (!r.ok) setErr(r.error);
              else {
                setErr(null);
                (e.target as HTMLFormElement).reset();
                router.refresh();
              }
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="category">Category</Label>
            <select id="category" name="category" value={cat} onChange={(e) => setCat(e.target.value as CostItem["category"])} className="h-9 w-full rounded-md border px-2 text-sm">
              <option value="IMPLEMENTATION">Implementation</option>
              <option value="TECHNOLOGY">Technology</option>
              <option value="OPERATING">Operating</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="subcategory">Item</Label>
            <select id="subcategory" name="subcategory" className="h-9 w-full rounded-md border px-2 text-sm">
              {COST_SUBCATEGORIES[cat].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="recurrence">Type</Label>
            <select id="recurrence" name="recurrence" defaultValue={cat === "IMPLEMENTATION" ? "ONE_TIME" : "RECURRING"} key={cat} className="h-9 w-full rounded-md border px-2 text-sm">
              <option value="ONE_TIME">One-time</option>
              <option value="RECURRING">Recurring (annual)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" name="amount" type="number" min={0} required />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add cost
          </Button>
        </form>
      )}
      {err && <p className="text-xs text-red-700">{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenario analysis — recalculated live in the browser with the same engine
// ---------------------------------------------------------------------------
type Knob = { key: keyof ScenarioOverrides; label: string; min: number; max: number; step: number; kind: "abs" | "rel" | "money" };
const KNOBS: Knob[] = [
  { key: "adoptionPct", label: "Adoption %", min: 0, max: 1, step: 0.01, kind: "abs" },
  { key: "automationPct", label: "AI-path automation %", min: 0, max: 1, step: 0.01, kind: "abs" },
  { key: "volumeChangePct", label: "Volume change", min: -0.5, max: 1, step: 0.01, kind: "rel" },
  { key: "fteCostChangePct", label: "FTE cost change", min: -0.3, max: 0.5, step: 0.01, kind: "rel" },
  { key: "aiCostChangePct", label: "AI run-cost change", min: -0.5, max: 1.5, step: 0.01, kind: "rel" },
  { key: "implementationCostChangePct", label: "Implementation cost change", min: -0.5, max: 1, step: 0.01, kind: "rel" },
  { key: "cycleTimeReductionPct", label: "Cycle-time reduction", min: 0, max: 0.95, step: 0.01, kind: "abs" },
  { key: "errorReductionPct", label: "Error reduction", min: 0, max: 0.95, step: 0.01, kind: "abs" },
  { key: "attributionPct", label: "AI attribution %", min: 0, max: 1, step: 0.01, kind: "abs" },
];

export function ScenarioWorkbench({ init, settings, modelPrices, canEdit }: { init: Initiative; settings: AppSettings; modelPrices: ModelPrice[]; canEdit: boolean }) {
  const router = useRouter();
  const names: ScenarioName[] = ["CONSERVATIVE", "EXPECTED", "AGGRESSIVE"];
  const initial = Object.fromEntries(names.map((n) => [n, init.scenarios.find((s) => s.name === n)?.overrides ?? (n === "EXPECTED" ? {} : defaultScenario(init, n))])) as Record<ScenarioName, ScenarioOverrides>;
  const [sc, setSc] = useState(initial);
  const [active, setActive] = useState<ScenarioName>("CONSERVATIVE");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const ctx = useMemo(() => ({ settings, modelPrices }), [settings, modelPrices]);
  const results = useMemo(() => names.map((n) => ({ n, v: evaluateInitiative(init, ctx, sc[n]) })), [init, ctx, sc]); // eslint-disable-line react-hooks/exhaustive-deps
  const src = init.actual?.metrics ?? init.target.metrics;
  const cur = (k: keyof ScenarioOverrides): number => {
    const o = sc[active][k];
    if (o !== undefined) return o as number;
    if (k === "adoptionPct") return src.adoptionRate;
    if (k === "automationPct") return src.adoptionRate ? src.automationRate / src.adoptionRate : 0;
    if (k === "attributionPct") return results[1].v.totals.derivedAttribution;
    if (k === "cycleTimeReductionPct") return results[1].v.productivity.cycleTime.value;
    if (k === "errorReductionPct") return results[1].v.quality.errorReduction.value;
    return 0;
  };
  const rows: [string, (v: (typeof results)[number]["v"]) => string][] = [
    ["Gross annual benefit", (v) => money(v.totals.counted)],
    ["Recurring AI cost", (v) => money(v.tco.recurring.value)],
    ["Net annual benefit", (v) => money(v.roi.netAnnualBenefit.value)],
    ["One-time investment", (v) => money(v.tco.oneTime.value)],
    [`ROI (${init.businessCase.horizonYears}-yr)`, (v) => (v.roi.roi.undefinedReason ? "n/a" : pct(v.roi.roi.value))],
    ["NPV", (v) => money(v.roi.npv.value)],
    ["IRR", (v) => (v.roi.irr.undefinedReason ? "n/a" : pct(v.roi.irr.value))],
    ["Payback", (v) => (v.roi.paybackMonths.undefinedReason ? "n/a" : `${v.roi.paybackMonths.value.toFixed(1)} mo`)],
    ["FTE capacity released", (v) => v.capacity.fteCapacityReleased.value.toFixed(1)],
    ["Adoption", (v) => pct(v.post.adoptionRate)],
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex gap-1 rounded-md bg-muted p-1" role="tablist">
          {names.map((n) => (
            <button key={n} role="tab" aria-selected={active === n} onClick={() => setActive(n)} className={cn("flex-1 rounded px-2 py-1 text-xs font-medium", active === n ? "bg-card shadow-sm" : "text-muted-foreground")}>
              {SCENARIO_LABEL[n]}
            </button>
          ))}
        </div>
        {KNOBS.map((k) => {
          const v = cur(k.key);
          const overridden = sc[active][k.key] !== undefined;
          return (
            <div key={k.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={cn(overridden ? "font-medium" : "text-muted-foreground")}>{k.label}</span>
                <span className="tabular">
                  {k.kind === "rel" ? `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%` : pct(v)}
                  {overridden && (
                    <button
                      className="ml-2 text-[10px] text-primary hover:underline"
                      onClick={() => {
                        const next = { ...sc[active] };
                        delete next[k.key];
                        setSc({ ...sc, [active]: next });
                      }}
                    >
                      reset
                    </button>
                  )}
                </span>
              </div>
              <Slider min={k.min} max={k.max} step={k.step} value={[v]} aria-label={k.label} onValueChange={([x]) => setSc({ ...sc, [active]: { ...sc[active], [k.key]: x } })} />
            </div>
          );
        })}
        <div className="space-y-1">
          <Label htmlFor="rev">Revenue uplift (annual)</Label>
          <Input id="rev" type="number" min={0} value={sc[active].revenueUpliftAnnual ?? ""} placeholder="unchanged" onChange={(e) => setSc({ ...sc, [active]: { ...sc[active], revenueUpliftAnnual: e.target.value === "" ? undefined : Number(e.target.value) } })} />
        </div>
        <Button
          size="sm"
          disabled={!canEdit || pending}
          onClick={() =>
            start(async () => {
              const r = await saveScenarioAction({ initiativeId: init.id, name: active, overrides: sc[active], notes: "" });
              setMsg(r.ok ? `${SCENARIO_LABEL[active]} scenario saved.` : r.error);
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save {SCENARIO_LABEL[active].toLowerCase()} scenario
        </Button>
        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      </div>
      <div className="space-y-3">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs tabular">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Metric</th>
                {results.map((r) => (
                  <th key={r.n} className={cn("px-3 py-2 text-right font-medium", r.n === active ? "text-primary" : "text-muted-foreground")}>
                    {SCENARIO_LABEL[r.n]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, f]) => (
                <tr key={label} className="border-t">
                  <td className="px-3 py-1.5">{label}</td>
                  {results.map((r) => (
                    <td key={r.n} className={cn("px-3 py-1.5 text-right", r.n === active && "font-semibold")}>
                      {f(r.v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <BarsChart
          data={results.map((r) => ({ name: SCENARIO_LABEL[r.n], benefit: r.v.totals.counted, cost: r.v.tco.recurring.value, net: r.v.roi.netAnnualBenefit.value }))}
          xKey="name"
          series={[
            { key: "benefit", label: "Gross benefit / yr", color: "#2a78d6" },
            { key: "cost", label: "AI run cost / yr", color: "#e34948" },
            { key: "net", label: "Net / yr", color: "#1baf7a" },
          ]}
          height={220}
        />
        <p className="text-[11px] text-muted-foreground">
          Scenarios re-run the same value engine with modified drivers (adoption re-blending, automation scaling, cost multipliers). No separate scenario maths.
          {results.find((r) => r.n === active)?.v.scenarioNotes.length ? ` Active changes: ${results.find((r) => r.n === active)!.v.scenarioNotes.join("; ")}.` : ""}
        </p>
      </div>
    </div>
  );
}
