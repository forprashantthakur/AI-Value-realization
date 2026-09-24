"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { upsertBenchmarkAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const METRICS = [
  ["avgHandlingMinutes", "Handling time", "min"],
  ["cycleTimeHours", "Cycle time", "hours"],
  ["errorRate", "Error rate", "%"],
  ["firstTimeRight", "First-time-right", "%"],
  ["slaAchievement", "SLA achievement", "%"],
];

export function BenchmarkUpload({ functions, industries }: { functions: { id: string; name: string }[]; industries: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="grid items-end gap-2 sm:grid-cols-4 lg:grid-cols-8"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const metric = METRICS.find((m) => m[0] === f.get("metric"))!;
        const isPct = metric[2] === "%";
        start(async () => {
          const r = await upsertBenchmarkAction({
            functionId: f.get("functionId"),
            industryId: f.get("industryId") || null,
            metric: metric[0],
            label: String(f.get("label") || metric[1]),
            unit: metric[2],
            median: Number(f.get("median")) / (isPct ? 100 : 1),
            topQuartile: Number(f.get("tq")) / (isPct ? 100 : 1),
            source: f.get("source"),
          });
          setMsg(r.ok ? "Benchmark added (marked as organization-provided, not illustrative)." : r.error);
          if (r.ok) router.refresh();
        });
      }}
    >
      <Sel name="functionId" label="Function" opts={functions.map((f) => [f.id, f.name])} />
      <Sel name="industryId" label="Industry" opts={[["", "Cross-industry"], ...industries.map((i) => [i.id, i.name])]} />
      <Sel name="metric" label="Metric" opts={METRICS.map((m) => [m[0], `${m[1]} (${m[2]})`])} />
      <div className="space-y-1">
        <Label htmlFor="label">Label</Label>
        <Input id="label" name="label" placeholder="optional" className="h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="median">Median</Label>
        <Input id="median" name="median" type="number" step="any" required className="h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="tq">Top quartile</Label>
        <Input id="tq" name="tq" type="number" step="any" required className="h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="source">Source (required)</Label>
        <Input id="source" name="source" required minLength={3} placeholder="e.g. 2026 internal study" className="h-9" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Upload />} Add
      </Button>
      {msg && <p className="text-xs text-muted-foreground sm:col-span-4 lg:col-span-8">{msg}</p>}
    </form>
  );
}

function Sel({ name, label, opts }: { name: string; label: string; opts: string[][] }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <select id={name} name={name} className="h-9 w-full rounded-md border px-2 text-sm">
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
