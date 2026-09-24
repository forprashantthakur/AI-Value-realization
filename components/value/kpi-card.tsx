import type { Metric } from "@/lib/value-engine/metric";
import { Card } from "@/components/ui/card";
import { ExplainButton } from "./explain";
import { cn } from "@/lib/utils";

export type ValueState = "forecast" | "target" | "actual" | "validated" | "realized";

const STATE: Record<ValueState, { label: string; color: string }> = {
  forecast: { label: "Forecast", color: "var(--vs-forecast)" },
  target: { label: "Target", color: "var(--vs-target)" },
  actual: { label: "Actual", color: "var(--vs-actual)" },
  validated: { label: "Validated", color: "var(--vs-validated)" },
  realized: { label: "Realized", color: "var(--vs-realized)" },
};

export function KpiCard({
  label,
  value,
  sub,
  metric,
  state,
  delta,
  className,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  metric?: Metric;
  state?: ValueState;
  delta?: { text: string; good: boolean };
  className?: string;
}) {
  return (
    <Card className={cn("relative flex flex-col gap-1 p-3.5", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          {state && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="h-2 w-2 rounded-sm" style={{ background: STATE[state].color }} />
              {STATE[state].label}
            </span>
          )}
          {metric && <ExplainButton metric={metric} />}
        </div>
      </div>
      <span className="text-[22px] font-semibold leading-tight tracking-tight tabular">{value}</span>
      {(sub || delta) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {delta && <span className={cn("font-medium", delta.good ? "text-[#006300]" : "text-red-700")}>{delta.text}</span>}
          {sub}
        </div>
      )}
    </Card>
  );
}
