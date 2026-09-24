"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Filter, Loader2, RotateCcw } from "lucide-react";
import type { FilterOptions } from "@/lib/services/portfolio-service";
import { monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

type Key = "org" | "industry" | "bu" | "fn" | "process" | "initiative" | "agent" | "country" | "from" | "to" | "status" | "scenario" | "stage" | "tech" | "roiMin" | "roiMax";

const STATUS_OPTS = [
  { value: "", label: "All value (incl. unvalidated)" },
  { value: "MEASURED", label: "≥ Measured" },
  { value: "BUSINESS_VALIDATED", label: "≥ Business validated" },
  { value: "FINANCE_VALIDATED", label: "≥ Finance validated" },
  { value: "REALIZED", label: "≥ Realized" },
  { value: "SUSTAINED", label: "Sustained" },
];
const SCENARIO_OPTS = [
  { value: "", label: "Actual / expected" },
  { value: "CONSERVATIVE", label: "Conservative" },
  { value: "AGGRESSIVE", label: "Aggressive" },
];

export function FilterBar({ options, show = ["org", "industry", "bu", "fn", "process", "initiative", "agent", "country", "from", "to", "status", "scenario"] }: { options: FilterOptions; show?: Key[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const set = (k: Key, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    start(() => router.push(`${path}?${next.toString()}`, { scroll: false }));
  };
  const active = show.filter((k) => sp.get(k)).length;

  const defs: Record<Key, { label: string; opts: { value: string; label: string }[] }> = {
    org: { label: "Organization", opts: options.organizations },
    industry: { label: "Industry", opts: options.industries },
    bu: { label: "Business unit", opts: options.businessUnits },
    fn: { label: "Function", opts: options.functions },
    process: { label: "Process", opts: options.processes },
    initiative: { label: "AI initiative", opts: options.initiatives },
    agent: { label: "Agent", opts: options.agents },
    country: { label: "Country", opts: options.countries },
    tech: { label: "AI technology", opts: options.technologies },
    stage: {
      label: "Stage",
      opts: ["DISCOVER", "BASELINE", "BUSINESS_CASE", "IMPLEMENT", "MEASURE", "VALIDATE", "REALIZE", "OPTIMIZE"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase() })),
    },
    from: { label: "From", opts: options.months.map((m) => ({ value: m, label: monthLabel(m) })) },
    to: { label: "To", opts: options.months.map((m) => ({ value: m, label: monthLabel(m) })) },
    status: { label: "Value status", opts: STATUS_OPTS.slice(1) },
    roiMin: { label: "ROI at least", opts: [-50, 0, 50, 100, 200, 300].map((v) => ({ value: String(v), label: `${v}%` })) },
    roiMax: { label: "ROI at most", opts: [0, 50, 100, 200, 300, 500].map((v) => ({ value: String(v), label: `${v}%` })) },
    scenario: { label: "Scenario", opts: SCENARIO_OPTS.slice(1) },
  };

  return (
    <div className="no-print rounded-lg border bg-card p-2.5">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">Filters</span>
        {active > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">{active} active</span>}
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Updating" />}
        {active > 0 && (
          <button onClick={() => start(() => router.push(path, { scroll: false }))} className="ml-auto inline-flex items-center gap-1 text-xs hover:text-foreground">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {show.map((k) => {
          const d = defs[k];
          const empty = k === "status" ? STATUS_OPTS[0].label : k === "scenario" ? SCENARIO_OPTS[0].label : `All`;
          return (
            <label key={k} className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{d.label}</span>
              <select
                value={sp.get(k) ?? ""}
                onChange={(e) => set(k, e.target.value)}
                className={cn(
                  "h-8 w-full min-w-0 truncate rounded-md border border-input bg-card px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring",
                  sp.get(k) && "border-primary/50 bg-primary/5",
                )}
              >
                <option value="">{empty}</option>
                {d.opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
