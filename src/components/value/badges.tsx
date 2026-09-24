import { AlertTriangle, CheckCircle2, CircleDashed, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BenefitNature, BenefitStatus, Confidence, Health, LifecycleStage } from "@/lib/domain/types";
import { CONFIDENCE_LABEL, HEALTH_LABEL, NATURE_LABEL, STAGE_LABEL, STATUS_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

export function HealthBadge({ health }: { health: Health }) {
  const map = {
    ON_TRACK: { v: "success" as const, I: CheckCircle2 },
    AT_RISK: { v: "warning" as const, I: AlertTriangle },
    OFF_TRACK: { v: "danger" as const, I: XCircle },
  }[health];
  return (
    <Badge variant={map.v}>
      <map.I className="h-3 w-3" aria-hidden />
      {HEALTH_LABEL[health]}
    </Badge>
  );
}

export function StageBadge({ stage }: { stage: LifecycleStage }) {
  return <Badge variant="secondary">{STAGE_LABEL[stage]}</Badge>;
}

const STATUS_COLOR: Record<BenefitStatus, string> = {
  PROPOSED: "var(--vs-forecast)",
  MEASURED: "var(--vs-actual)",
  BUSINESS_VALIDATED: "#5598e7",
  FINANCE_VALIDATED: "var(--vs-validated)",
  REALIZED: "var(--vs-realized)",
  SUSTAINED: "var(--vs-sustained)",
};

export function StatusBadge({ status }: { status: BenefitStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium">
      <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[status] }} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function NatureBadge({ nature }: { nature: BenefitNature }) {
  const v = nature === "MEASURED" ? "info" : nature === "ESTIMATED" ? "warning" : "muted";
  return (
    <Badge variant={v} className={cn(nature === "ESTIMATED" && "border-dashed border-amber-300")}>
      {nature === "ESTIMATED" && <CircleDashed className="h-3 w-3" aria-hidden />}
      {NATURE_LABEL[nature]}
    </Badge>
  );
}

export function ConfidenceBadge({ level, compact }: { level: Confidence; compact?: boolean }) {
  const v = level === "HIGH" ? "success" : level === "MEDIUM" ? "warning" : "danger";
  const bars = level === "HIGH" ? 3 : level === "MEDIUM" ? 2 : 1;
  return (
    <Badge variant={v} title="Rule-based evidence rating — not a statistical confidence interval">
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((b) => (
          <span key={b} className={cn("w-[3px] rounded-sm", b <= bars ? "bg-current" : "bg-current/25")} style={{ height: 3 + b * 2 }} />
        ))}
      </span>
      {compact ? level.charAt(0) + level.slice(1).toLowerCase() : CONFIDENCE_LABEL[level]}
    </Badge>
  );
}

export function IllustrativeBadge({ text = "Illustrative" }: { text?: string }) {
  return (
    <Badge variant="warning" className="border-dashed border-amber-300">
      <ShieldCheck className="h-3 w-3" aria-hidden />
      {text}
    </Badge>
  );
}

/** Legend for the five value states used across every chart. */
export function ValueStateLegend({ className }: { className?: string }) {
  const items = [
    { k: "Forecast", c: "var(--vs-forecast)", dashed: true },
    { k: "Target", c: "var(--vs-target)" },
    { k: "Actual", c: "var(--vs-actual)" },
    { k: "Validated", c: "var(--vs-validated)" },
    { k: "Realized", c: "var(--vs-realized)" },
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground", className)}>
      {items.map((i) => (
        <span key={i.k} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm", i.dashed && "border border-dashed border-sky-500")} style={{ background: i.c }} />
          {i.k}
        </span>
      ))}
    </div>
  );
}
