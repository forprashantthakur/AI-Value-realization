"use client";
import { Info } from "lucide-react";
import type { Metric } from "@/lib/value-engine/metric";
import { fmtMetric, fmtUnit } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfidenceBadge } from "./badges";
import { cn } from "@/lib/utils";

/** "Explain this calculation" — renders any engine Metric: definition, formula, inputs, assumptions, example. */
export function ExplainButton({ metric, className, label }: { metric: Metric; className?: string; label?: string }) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn("inline-flex items-center gap-1 rounded text-muted-foreground hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        aria-label={`Explain ${metric.label}`}
      >
        <Info className="h-3.5 w-3.5" />
        {label && <span className="text-xs">{label}</span>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow">Explain this calculation</p>
          <DialogTitle>{metric.label}</DialogTitle>
          <DialogDescription>{metric.definition}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-2xl font-semibold tabular">{fmtMetric(metric)}</span>
          {metric.confidence && <ConfidenceBadge level={metric.confidence} />}
          {metric.undefinedReason && <span className="text-xs text-amber-700">{metric.undefinedReason}</span>}
        </div>
        <Section title="Formula">
          <code className="block rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-foreground">{metric.formula}</code>
        </Section>
        {metric.inputs.length > 0 && (
          <Section title="Inputs">
            <div className="max-h-56 overflow-y-auto rounded-md border">
              <table className="w-full text-xs tabular">
                <tbody>
                  {metric.inputs.map((i, k) => (
                    <tr key={k} className="border-b last:border-0">
                      <td className="px-3 py-1.5 text-muted-foreground">{i.name}</td>
                      <td className="px-3 py-1.5 text-right font-medium">
                        {typeof i.value === "number" ? fmtUnit(i.value, i.unit ?? "count", i.unit === "percent" ? 1 : 2) : i.value}
                      </td>
                      {i.source && <td className="px-3 py-1.5 text-muted-foreground">{i.source}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
        {metric.example && (
          <Section title="Worked example">
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs tabular">{metric.example}</p>
          </Section>
        )}
        {metric.assumptions.length > 0 && (
          <Section title="Assumptions">
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {metric.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Section>
        )}
        <p className="text-[11px] text-muted-foreground">Source: value engine (`{metric.key}`). Computed from stored inputs at request time — never hard-coded.</p>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="eyebrow">{title}</p>
      {children}
    </div>
  );
}
