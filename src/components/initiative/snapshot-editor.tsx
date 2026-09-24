"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import type { ProcessMetrics, SnapshotKind } from "@/lib/domain/types";
import { computeCapacity, reconcileBaseline } from "@/lib/value-engine/capacity";
import { saveSnapshotAction } from "@/app/actions/initiative";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricsFields, ZERO_METRICS, type MetricsSection } from "./metrics-fields";
import { money, num, pct } from "@/lib/format";

export function SnapshotEditor({
  initiativeId,
  kind,
  initial,
  baseline,
  productiveHours,
  laborBasis,
  canEdit,
  defaultOwner,
}: {
  initiativeId: string;
  kind: SnapshotKind;
  initial: { metrics: ProcessMetrics; asOf: string; source: string; owner: string } | null;
  baseline: ProcessMetrics;
  productiveHours: number;
  laborBasis: "ACTIVITY" | "FTE_CALIBRATED";
  canEdit: boolean;
  defaultOwner: string;
}) {
  const router = useRouter();
  const [m, setM] = useState<Partial<ProcessMetrics>>(initial?.metrics ?? (kind === "BASELINE" ? ZERO_METRICS : { ...baseline }));
  const [asOf, setAsOf] = useState(initial?.asOf ?? new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState(initial?.source ?? "");
  const [owner, setOwner] = useState(initial?.owner ?? defaultOwner);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const sections: MetricsSection[] = kind === "BASELINE" ? ["volume", "time", "cost", "quality"] : ["volume", "time", "cost", "quality", "adoption"];
  const full = { ...ZERO_METRICS, ...m } as ProcessMetrics;

  // Live preview uses the same value engine as the server (pure functions).
  const recon = reconcileBaseline(kind === "BASELINE" ? full : baseline, productiveHours);
  const preview = kind !== "BASELINE" && full.transactionsPerYear > 0 ? computeCapacity({ baseline, post: full, productiveHoursPerFte: productiveHours, basis: laborBasis }) : null;
  const cpt = full.transactionsPerYear > 0 ? (full.fte * full.fullyLoadedFteCost + full.technologyCostAnnual + full.outsourcingCostAnnual) / full.transactionsPerYear : 0;

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await saveSnapshotAction({ initiativeId, kind, asOf, source, owner, metrics: full });
      if (r.ok) {
        setErrors({});
        setMsg({ ok: true, text: "Saved. All value metrics have been recalculated and the change is in the audit trail." });
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        setMsg({ ok: false, text: r.error });
      }
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="asOf">Measured as of</Label>
            <Input id="asOf" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="source">Data source</Label>
            <Input id="source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Process mining + time study" disabled={!canEdit} aria-invalid={!!errors.source} />
            {errors.source && <p className="text-[11px] text-red-700">{errors.source}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="owner">Metric owner</Label>
            <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <fieldset disabled={!canEdit} className="disabled:opacity-80">
          <MetricsFields sections={sections} value={m} onChange={setM} errors={errors} compare={kind === "BASELINE" ? undefined : baseline} />
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={!canEdit || pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save {kind.toLowerCase()} measurement
          </Button>
          {!canEdit && <span className="text-xs text-muted-foreground">Your role is read-only for measurements.</span>}
          {msg && (
            <span className={msg.ok ? "inline-flex items-center gap-1 text-xs text-[#006300]" : "text-xs text-red-700"} role="status">
              {msg.ok && <CheckCircle2 className="h-3.5 w-3.5" />} {msg.text}
            </span>
          )}
        </div>
      </div>
      <aside className="space-y-3 rounded-lg border bg-muted/30 p-3 text-xs">
        <p className="eyebrow">Live calculation preview</p>
        {kind === "BASELINE" ? (
          <>
            <Row k="Labour cost per transaction" v={money(cpt, { compact: false })} />
            <Row k="Output per FTE" v={num(full.fte ? full.transactionsPerYear / full.fte : 0)} />
            <div className={recon.status === "OK" ? "text-[#006300]" : recon.status === "WARN" ? "text-amber-700" : "text-red-700"}>
              <p className="font-medium">Reconciliation: {recon.status}</p>
              <p className="mt-0.5 leading-relaxed">{recon.message}</p>
            </div>
          </>
        ) : preview ? (
          <>
            <Row k="Hours released / yr" v={num(preview.hoursReleased.value)} />
            <Row k="FTE capacity released" v={`${preview.fteCapacityReleased.value.toFixed(1)} FTE`} />
            <Row k="Post-AI FTE requirement" v={`${preview.postRequiredFte.value.toFixed(1)} FTE`} />
            <Row k="Capacity value (not cash)" v={money(preview.capacityValue.value)} />
            <Row k="Touch-time reduction" v={pct(baseline.avgHandlingMinutes ? 1 - full.avgHandlingMinutes / baseline.avgHandlingMinutes : 0)} />
            <Row k="Error-rate reduction" v={pct(baseline.errorRate ? 1 - full.errorRate / baseline.errorRate : 0)} />
            <p className="text-muted-foreground">Financial benefit depends on the capacity disposition and attribution (Value tab).</p>
          </>
        ) : (
          <p className="text-muted-foreground">Enter volume to preview.</p>
        )}
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium tabular">{v}</span>
    </div>
  );
}
