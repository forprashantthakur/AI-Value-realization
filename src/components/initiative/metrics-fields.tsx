"use client";
import { useState } from "react";
import type { ProcessMetrics, TimeUnit } from "@/lib/domain/types";
import { fromMinutes, toMinutes } from "@/lib/value-engine/units";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type MetricsSection = "volume" | "time" | "cost" | "quality" | "adoption";

type FieldKind = "number" | "currency" | "rate" | "time" | "index";
interface FieldDef {
  key: keyof ProcessMetrics;
  label: string;
  kind: FieldKind;
  help?: string;
  /** For time fields: the stored unit. */
  base?: "MINUTES" | "HOURS";
  optional?: boolean;
}

export const SECTIONS: Record<MetricsSection, { title: string; description: string; fields: FieldDef[] }> = {
  volume: {
    title: "Volume",
    description: "How much work flows through the process.",
    fields: [
      { key: "transactionsPerYear", label: "Transactions per year", kind: "number", help: "Monthly × 12 if only monthly is known" },
      { key: "peakMonthlyVolume", label: "Peak monthly volume", kind: "number", optional: true },
      { key: "users", label: "Number of users", kind: "number", optional: true },
      { key: "fte", label: "FTEs in the process", kind: "number", help: "Include shared-service and outsourced FTE if their cost is in scope" },
    ],
  },
  time: {
    title: "Time",
    description: "Touch time is effort; cycle time is elapsed. Choose any unit — values are normalised.",
    fields: [
      { key: "avgHandlingMinutes", label: "Average handling (touch) time", kind: "time", base: "MINUTES" },
      { key: "waitingMinutes", label: "Waiting time", kind: "time", base: "MINUTES", optional: true },
      { key: "cycleTimeHours", label: "End-to-end cycle time", kind: "time", base: "HOURS" },
      { key: "reworkMinutes", label: "Rework effort per reworked item", kind: "time", base: "MINUTES" },
    ],
  },
  cost: {
    title: "Cost",
    description: "Annual amounts in reporting currency. Cost per transaction is calculated, not entered.",
    fields: [
      { key: "fullyLoadedFteCost", label: "Fully loaded cost per FTE (annual)", kind: "currency", help: "Salary + benefits + facilities + overhead" },
      { key: "technologyCostAnnual", label: "Process technology cost (annual)", kind: "currency" },
      { key: "outsourcingCostAnnual", label: "Outsourcing / BPO cost (annual)", kind: "currency" },
    ],
  },
  quality: {
    title: "Quality",
    description: "Enter percentages (e.g. 8 for 8%).",
    fields: [
      { key: "errorRate", label: "Error rate %", kind: "rate" },
      { key: "reworkRate", label: "Rework rate %", kind: "rate" },
      { key: "exceptionRate", label: "Exception rate %", kind: "rate" },
      { key: "firstTimeRight", label: "First-time-right %", kind: "rate" },
      { key: "slaAchievement", label: "SLA achievement %", kind: "rate" },
      { key: "csat", label: "Customer satisfaction (0–100)", kind: "index", optional: true },
      { key: "employeeSatisfaction", label: "Employee satisfaction (0–100)", kind: "index", optional: true },
    ],
  },
  adoption: {
    title: "AI adoption at time of measurement",
    description: "Zero for baseline. For post-AI: share of eligible volume through the AI path and share fully touchless.",
    fields: [
      { key: "adoptionRate", label: "Adoption % (AI-path volume)", kind: "rate" },
      { key: "automationRate", label: "Automation % (touchless)", kind: "rate" },
    ],
  },
};

function TimeInput({ value, base, onChange, id, invalid }: { value: number | undefined; base: "MINUTES" | "HOURS"; onChange: (v: number | undefined) => void; id: string; invalid?: boolean }) {
  const [unit, setUnit] = useState<TimeUnit>(base);
  const minutes = value === undefined ? undefined : base === "HOURS" ? value * 60 : value;
  const shown = minutes === undefined ? "" : String(Math.round(fromMinutes(minutes, unit) * 1000) / 1000);
  return (
    <div className="flex gap-1">
      <Input
        id={id}
        type="number"
        step="any"
        min={0}
        aria-invalid={invalid}
        value={shown}
        onChange={(e) => {
          if (e.target.value === "") return onChange(undefined);
          const m = toMinutes(Number(e.target.value), unit);
          onChange(base === "HOURS" ? m / 60 : m);
        }}
      />
      <select value={unit} onChange={(e) => setUnit(e.target.value as TimeUnit)} className="h-9 rounded-md border border-input bg-card px-1.5 text-xs" aria-label="Unit">
        <option value="SECONDS">sec</option>
        <option value="MINUTES">min</option>
        <option value="HOURS">hours</option>
        <option value="DAYS">days</option>
      </select>
    </div>
  );
}

export function MetricsFields({
  sections,
  value,
  onChange,
  errors,
  compare,
}: {
  sections: MetricsSection[];
  value: Partial<ProcessMetrics>;
  onChange: (v: Partial<ProcessMetrics>) => void;
  errors?: Record<string, string>;
  compare?: Partial<ProcessMetrics>;
}) {
  const set = (k: keyof ProcessMetrics, v: number | undefined) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-5">
      {sections.map((s) => (
        <fieldset key={s} className="space-y-2">
          <legend className="section-title">{SECTIONS[s].title}</legend>
          <p className="text-xs text-muted-foreground">{SECTIONS[s].description}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS[s].fields.map((f) => {
              const id = `f-${f.key}`;
              const v = value[f.key] as number | undefined;
              const err = errors?.[`metrics.${f.key}`] ?? errors?.[f.key];
              const cmp = compare?.[f.key] as number | undefined;
              return (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={id}>
                    {f.label}
                    {f.optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
                  </Label>
                  {f.kind === "time" ? (
                    <TimeInput id={id} value={v} base={f.base!} onChange={(n) => set(f.key, n)} invalid={!!err} />
                  ) : (
                    <Input
                      id={id}
                      type="number"
                      step="any"
                      min={0}
                      max={f.kind === "rate" ? 100 : undefined}
                      aria-invalid={!!err}
                      value={v === undefined || v === null ? "" : f.kind === "rate" ? String(Math.round(v * 10000) / 100) : String(v)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") return set(f.key, undefined);
                        set(f.key, f.kind === "rate" ? Number(raw) / 100 : Number(raw));
                      }}
                    />
                  )}
                  <p className={cn("text-[11px]", err ? "text-red-700" : "text-muted-foreground")}>
                    {err ??
                      (cmp !== undefined
                        ? `Baseline: ${f.kind === "rate" ? `${(cmp * 100).toFixed(1)}%` : f.kind === "time" && f.base === "HOURS" ? `${cmp.toFixed(1)} h` : f.kind === "time" ? `${cmp.toFixed(1)} min` : cmp.toLocaleString("en-IN")}`
                        : f.help ?? "")}
                  </p>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export const ZERO_METRICS: ProcessMetrics = {
  transactionsPerYear: 0,
  fte: 0,
  avgHandlingMinutes: 0,
  cycleTimeHours: 0,
  reworkMinutes: 0,
  fullyLoadedFteCost: 0,
  technologyCostAnnual: 0,
  outsourcingCostAnnual: 0,
  errorRate: 0,
  reworkRate: 0,
  exceptionRate: 0,
  firstTimeRight: 0,
  slaAchievement: 0,
  automationRate: 0,
  adoptionRate: 0,
};
