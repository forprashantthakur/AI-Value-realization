"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Metric } from "@/lib/value-engine/metric";
import { ExplainButton } from "./explain";
import { cn } from "@/lib/utils";

export interface TreeNode {
  id: string;
  label: string;
  value: string;
  sub?: string;
  metric?: Metric;
  tone?: "financial" | "operational" | "agent" | "capacity" | "cost";
  children?: TreeNode[];
}

const TONE: Record<NonNullable<TreeNode["tone"]>, string> = {
  financial: "border-l-[#1baf7a]",
  operational: "border-l-[#2a78d6]",
  agent: "border-l-[#4a3aa7]",
  capacity: "border-l-[#c3c2b7]",
  cost: "border-l-[#d03b3b]",
};

function Node({ n, depth }: { n: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const has = !!n.children?.length;
  return (
    <li className="relative">
      <div className={cn("flex items-center gap-2 rounded-md border border-l-4 bg-card px-2.5 py-1.5", TONE[n.tone ?? "operational"])}>
        {has ? (
          <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${n.label}`} className="rounded p-0.5 hover:bg-muted">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{n.label}</p>
          {n.sub && <p className="truncate text-[11px] text-muted-foreground">{n.sub}</p>}
        </div>
        <span className="shrink-0 text-xs font-semibold tabular">{n.value}</span>
        {n.metric && <ExplainButton metric={n.metric} />}
      </div>
      {has && open && (
        <ul className="ml-5 mt-1.5 space-y-1.5 border-l border-dashed pl-4">
          {n.children!.map((c) => (
            <Node key={c.id} n={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Interactive value tree: trace each financial benefit back to operational drivers and agents. */
export function ValueTree({ root }: { root: TreeNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {(["financial", "capacity", "operational", "agent", "cost"] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className={cn("h-3 w-1 rounded-sm border-l-4", TONE[t])} />
            {t === "financial" ? "Financial outcome" : t === "capacity" ? "Capacity (non-cash)" : t === "operational" ? "Operational driver" : t === "agent" ? "AI agent" : "AI cost"}
          </span>
        ))}
      </div>
      <ul className="space-y-1.5">
        <Node n={root} depth={0} />
      </ul>
    </div>
  );
}
