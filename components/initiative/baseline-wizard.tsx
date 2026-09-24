"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { BusinessUnit, FunctionDomain, Industry, Organization, ProcessMetrics, ProcessNode } from "@/lib/domain/types";
import { computeCapacity, reconcileBaseline } from "@/lib/value-engine/capacity";
import { createInitiativeAction } from "@/app/actions/initiative";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricsFields, ZERO_METRICS } from "./metrics-fields";
import { money, num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS = ["Context", "Volume", "Time", "Cost", "Quality", "Targets & assumptions", "Review"] as const;

export function BaselineWizard(props: {
  organizations: Organization[];
  businessUnits: BusinessUnit[];
  functions: FunctionDomain[];
  processes: ProcessNode[];
  industries: Industry[];
  defaultProductiveHours: number;
  owner: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ctx, setCtx] = useState({
    code: "",
    name: "",
    description: "",
    organizationId: props.organizations[0]?.id ?? "",
    businessUnitId: "",
    functionId: props.functions[0]?.id ?? "",
    processId: "",
    country: "India",
    useCase: "",
    aiTechnology: "Agentic AI",
    owner: props.owner,
    productOwner: props.owner,
    complexity: 3,
    strategicAlignment: 3,
    riskLevel: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH",
  });
  const [base, setBase] = useState<Partial<ProcessMetrics>>({ ...ZERO_METRICS, transactionsPerYear: undefined as unknown as number });
  const [tgt, setTgt] = useState({ aht: 0, cycle: 0, err: 0, rework: 0, adoption: 0.8, automation: 0.5, attribution: 0.7, productiveHours: props.defaultProductiveHours, costPerError: 0 });

  const industry = props.industries.find((i) => i.id === props.organizations.find((o) => o.id === ctx.organizationId)?.industryId);
  const bus = props.businessUnits.filter((b) => b.organizationId === ctx.organizationId);
  const procs = props.processes.filter((p) => p.functionId === ctx.functionId);
  const b = useMemo(() => ({ ...ZERO_METRICS, ...base }) as ProcessMetrics, [base]);
  const target: ProcessMetrics = useMemo(
    () => ({
      ...b,
      avgHandlingMinutes: tgt.aht || b.avgHandlingMinutes,
      cycleTimeHours: tgt.cycle || b.cycleTimeHours,
      errorRate: tgt.err || b.errorRate,
      reworkRate: tgt.rework || b.reworkRate,
      adoptionRate: tgt.adoption,
      automationRate: Math.min(tgt.adoption, tgt.automation),
    }),
    [b, tgt],
  );
  const recon = reconcileBaseline(b, tgt.productiveHours);
  const cap = b.transactionsPerYear > 0 ? computeCapacity({ baseline: b, post: target, productiveHoursPerFte: tgt.productiveHours, basis: "FTE_CALIBRATED" }) : null;

  const valid = [
    ctx.code.length >= 3 && ctx.name.length >= 3 && ctx.businessUnitId && ctx.processId && ctx.useCase.length >= 3 && ctx.description.length >= 5,
    (b.transactionsPerYear ?? 0) > 0 && b.fte > 0,
    b.avgHandlingMinutes > 0 && b.cycleTimeHours > 0,
    b.fullyLoadedFteCost > 0,
    true,
    tgt.productiveHours >= 800,
    true,
  ];

  const submit = () =>
    start(async () => {
      setErr(null);
      const r = await createInitiativeAction({
        ...ctx,
        productiveHoursPerFte: tgt.productiveHours,
        costPerError: tgt.costPerError,
        baseline: { ...b, adoptionRate: 0, automationRate: 0 },
        target,
        plannedAdoption: tgt.adoption,
        attributionPct: tgt.attribution,
      });
      if (r.ok && r.data) router.push(`/initiatives/${r.data.id}/overview`);
      else if (!r.ok) setErr(r.error);
    });

  const T = (k: keyof typeof tgt, label: string, opts: { pct?: boolean; help?: string } = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`t-${k}`}>{label}</Label>
      <Input
        id={`t-${k}`}
        type="number"
        step="any"
        min={0}
        value={opts.pct ? Math.round(tgt[k] * 1000) / 10 : tgt[k]}
        onChange={(e) => setTgt({ ...tgt, [k]: Number(e.target.value) / (opts.pct ? 100 : 1) })}
      />
      {opts.help && <p className="text-[11px] text-muted-foreground">{opts.help}</p>}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <ol className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Wizard steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => i <= step && setStep(i)}
              className={cn("flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-2 text-left text-xs", i === step ? "bg-primary/10 font-medium text-primary" : i < step ? "text-foreground hover:bg-muted" : "text-muted-foreground")}
              aria-current={i === step ? "step" : undefined}
            >
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border text-[10px]", i < step && "border-primary bg-primary text-white")}>{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>
      <div className="space-y-4 rounded-lg border bg-card p-4">
        {step === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Initiative code" v={ctx.code} on={(v) => setCtx({ ...ctx, code: v.toUpperCase() })} placeholder="e.g. AP-02" />
            <F label="Initiative name" v={ctx.name} on={(v) => setCtx({ ...ctx, name: v })} placeholder="e.g. Invoice Exception Agent" />
            <S label="Organization" v={ctx.organizationId} on={(v) => setCtx({ ...ctx, organizationId: v, businessUnitId: "" })} opts={props.organizations.map((o) => [o.id, o.name])} />
            <S label="Business unit" v={ctx.businessUnitId} on={(v) => setCtx({ ...ctx, businessUnitId: v })} opts={bus.map((x) => [x.id, x.name])} placeholder="Select…" />
            <S label="Function" v={ctx.functionId} on={(v) => setCtx({ ...ctx, functionId: v, processId: "" })} opts={props.functions.map((f) => [f.id, f.name])} />
            <S label="Process / sub-process" v={ctx.processId} on={(v) => setCtx({ ...ctx, processId: v })} opts={procs.map((x) => [x.id, `${"— ".repeat(["PROCESS", "SUBPROCESS", "ACTIVITY", "TASK"].indexOf(x.level))}${x.name}`])} placeholder="Select…" />
            <F label="AI use case" v={ctx.useCase} on={(v) => setCtx({ ...ctx, useCase: v })} />
            <S label="AI technology" v={ctx.aiTechnology} on={(v) => setCtx({ ...ctx, aiTechnology: v })} opts={["Agentic AI", "GenAI", "ML", "ML + GenAI", "ML + Agentic AI"].map((x) => [x, x])} />
            <F label="Country" v={ctx.country} on={(v) => setCtx({ ...ctx, country: v })} />
            <F label="Business owner" v={ctx.owner} on={(v) => setCtx({ ...ctx, owner: v })} />
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="desc">Problem statement</Label>
              <Textarea id="desc" value={ctx.description} onChange={(e) => setCtx({ ...ctx, description: e.target.value })} />
            </div>
            <S label="Implementation complexity (1–5)" v={String(ctx.complexity)} on={(v) => setCtx({ ...ctx, complexity: Number(v) })} opts={[1, 2, 3, 4, 5].map((n) => [String(n), String(n)])} />
            <S label="Strategic alignment (1–5)" v={String(ctx.strategicAlignment)} on={(v) => setCtx({ ...ctx, strategicAlignment: Number(v) })} opts={[1, 2, 3, 4, 5].map((n) => [String(n), String(n)])} />
            {industry && (
              <div className="rounded-md bg-muted/60 p-3 text-xs sm:col-span-2">
                <p className="font-medium">Suggested {industry.name} use cases</p>
                <p className="text-muted-foreground">{industry.suggestedUseCases.join(" · ")}</p>
              </div>
            )}
          </div>
        )}
        {step >= 1 && step <= 4 && (
          <MetricsFields sections={[(["volume", "time", "cost", "quality"] as const)[step - 1]]} value={base} onChange={setBase} />
        )}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Business-case targets: what the process should look like on the AI path, blended at planned adoption. Leave a field at 0 to keep the baseline value.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {T("aht", "Target handling time (min, blended)")}
              {T("cycle", "Target cycle time (hours)")}
              {T("err", "Target error rate %", { pct: true })}
              {T("rework", "Target rework rate %", { pct: true })}
              {T("adoption", "Planned adoption %", { pct: true })}
              {T("automation", "Target automation (touchless) %", { pct: true })}
              {T("attribution", "Initial AI attribution %", { pct: true, help: "Agreed with Finance later" })}
              {T("productiveHours", "Productive hours per FTE / yr", { help: "Net of leave, training, meetings" })}
              {T("costPerError", "Downstream cost per error", { help: "Exclude internal rework labour" })}
            </div>
          </div>
        )}
        {step === 6 && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <p className="section-title">
                {ctx.code} · {ctx.name}
              </p>
              <p className="text-xs text-muted-foreground">{ctx.description}</p>
              <dl className="grid grid-cols-2 gap-1 text-xs">
                <dt className="text-muted-foreground">Volume / yr</dt>
                <dd>{num(b.transactionsPerYear)}</dd>
                <dt className="text-muted-foreground">FTE</dt>
                <dd>{b.fte}</dd>
                <dt className="text-muted-foreground">AHT</dt>
                <dd>{b.avgHandlingMinutes.toFixed(1)} min</dd>
                <dt className="text-muted-foreground">Cost / txn (labour)</dt>
                <dd>{money(b.transactionsPerYear ? (b.fte * b.fullyLoadedFteCost) / b.transactionsPerYear : 0, { compact: false })}</dd>
                <dt className="text-muted-foreground">Error rate</dt>
                <dd>{pct(b.errorRate, 1)}</dd>
              </dl>
              <p className={cn("rounded-md p-2 text-xs", recon.status === "OK" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>
                Reconciliation {recon.status}: {recon.message}
              </p>
            </div>
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
              <p className="eyebrow">Business-case preview (value engine)</p>
              {cap ? (
                <>
                  <p>
                    Hours released: <strong>{num(cap.hoursReleased.value)}</strong> / yr
                  </p>
                  <p>
                    FTE capacity: <strong>{cap.fteCapacityReleased.value.toFixed(1)} FTE</strong>
                  </p>
                  <p>
                    Economic value of capacity: <strong>{money(cap.capacityValue.value)}</strong>
                  </p>
                  <p className="text-muted-foreground">
                    This is capacity, not cash. Financial benefit appears only after the business owner declares the capacity disposition (Value tab) and Finance agrees attribution.
                  </p>
                </>
              ) : (
                <p>Enter volume to preview.</p>
              )}
            </div>
          </div>
        )}
        {err && <p className="text-xs text-red-700">{err}</p>}
        <div className="flex items-center justify-between border-t pt-3">
          <Button variant="outline" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ChevronLeft /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep(step + 1)} disabled={!valid[step]}>
              Next <ChevronRight />
            </Button>
          ) : (
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Create initiative
            </Button>
          )}
        </div>
        {!valid[step] && <p className="text-right text-[11px] text-muted-foreground">Complete the required fields to continue.</p>}
      </div>
    </div>
  );
}

function F({ label, v, on, placeholder }: { label: string; v: string; on: (v: string) => void; placeholder?: string }) {
  const id = `w-${label.replace(/\W+/g, "-")}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={v} placeholder={placeholder} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
function S({ label, v, on, opts, placeholder }: { label: string; v: string; on: (v: string) => void; opts: string[][]; placeholder?: string }) {
  const id = `w-${label.replace(/\W+/g, "-")}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={v} onChange={(e) => on(e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
        {placeholder && <option value="">{placeholder}</option>}
        {opts.map(([val, l]) => (
          <option key={val} value={val}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
