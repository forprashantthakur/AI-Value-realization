import { Check } from "lucide-react";
import { LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/domain/types";
import { STAGE_GATE, STAGE_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

/** Discover → Baseline → Business Case → Implement → Measure → Validate → Realize → Optimize with gates. */
export function LifecycleStepper({ stage, compact }: { stage: LifecycleStage; compact?: boolean }) {
  const idx = LIFECYCLE_STAGES.indexOf(stage);
  return (
    <ol className="flex w-full items-start gap-0 overflow-x-auto" aria-label="Value realization lifecycle">
      {LIFECYCLE_STAGES.map((s, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <li key={s} className="flex min-w-[88px] flex-1 flex-col items-center gap-1 text-center" title={`Gate: ${STAGE_GATE[s]}`}>
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : i <= idx ? "bg-primary" : "bg-border")} />
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold",
                  done && "border-primary bg-primary text-white",
                  current && "border-primary bg-white text-primary ring-4 ring-primary/15",
                  !done && !current && "border-border bg-card text-muted-foreground",
                )}
                aria-current={current ? "step" : undefined}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("h-0.5 flex-1", i === LIFECYCLE_STAGES.length - 1 ? "bg-transparent" : i < idx ? "bg-primary" : "bg-border")} />
            </div>
            <span className={cn("text-[11px] font-medium", current ? "text-primary" : done ? "text-foreground" : "text-muted-foreground")}>{STAGE_LABEL[s]}</span>
            {!compact && <span className="hidden px-1 text-[10px] leading-tight text-muted-foreground xl:block">{STAGE_GATE[s]}</span>}
          </li>
        );
      })}
    </ol>
  );
}
