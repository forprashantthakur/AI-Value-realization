import { ArrowRight, Bot } from "lucide-react";
import type { AiAgent } from "@/lib/domain/types";
import { MODE_LABEL } from "@/lib/domain/labels";
import { pct, num } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Agentic Process Flow: agents in sequence with HITL mode, designed automation and live autonomy. */
export function AgentFlow({ agents, className }: { agents: AiAgent[]; className?: string }) {
  if (!agents.length) return <p className="text-xs text-muted-foreground">No agents defined yet.</p>;
  const sorted = [...agents].sort((a, b) => a.sequence - b.sequence);
  return (
    <div className={cn("flex items-stretch gap-1.5 overflow-x-auto pb-2", className)} role="list" aria-label="Agentic process flow">
      {sorted.map((a, i) => {
        const autonomyGap = a.performance.autonomousCompletionRate - a.automationPct;
        return (
          <div key={a.id} className="flex items-center gap-1.5" role="listitem">
            <div className="flex w-[190px] shrink-0 flex-col gap-1.5 rounded-lg border bg-card p-2.5 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#4a3aa7]/10 text-[#4a3aa7]">
                  <Bot className="h-3.5 w-3.5" />
                </span>
                <span className="text-[10px] font-medium text-muted-foreground">Step {i + 1}</span>
                <span className={cn("ml-auto rounded px-1 text-[9px] font-semibold uppercase", a.status === "LIVE" ? "bg-emerald-50 text-emerald-800" : a.status === "PILOT" ? "bg-sky-50 text-sky-800" : "bg-muted text-muted-foreground")}>
                  {a.status}
                </span>
              </div>
              <p className="text-xs font-semibold leading-tight">{a.name}</p>
              <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{a.description}</p>
              <span className="w-fit rounded border px-1.5 text-[10px]">{MODE_LABEL[a.humanInLoopModel]}</span>
              <dl className="grid grid-cols-2 gap-x-2 text-[10px] tabular">
                <dt className="text-muted-foreground">Designed</dt>
                <dd className="text-right font-medium">{pct(a.automationPct)}</dd>
                <dt className="text-muted-foreground">Autonomous</dt>
                <dd className={cn("text-right font-medium", a.status === "LIVE" && autonomyGap < -0.08 && "text-red-700")}>{a.status === "LIVE" ? pct(a.performance.autonomousCompletionRate) : "—"}</dd>
                <dt className="text-muted-foreground">Tasks / mo</dt>
                <dd className="text-right font-medium">{num(a.performance.tasksPerMonth)}</dd>
              </dl>
            </div>
            {i < sorted.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}
