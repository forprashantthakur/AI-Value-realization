import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Metric } from "@/lib/value-engine/metric";
import { ExplainButton } from "./explain";
import { cn } from "@/lib/utils";

export interface ComparisonRow {
  metric: string;
  baseline: string;
  target?: string;
  actual: string;
  improvement: string;
  good: boolean | null;
  explain?: Metric;
  benchmark?: string;
}

export function ComparisonTable({ rows, showTarget = true, showBenchmark = false }: { rows: ComparisonRow[]; showTarget?: boolean; showBenchmark?: boolean }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Metric</TH>
          <TH className="text-right">Baseline</TH>
          {showTarget && <TH className="text-right">Target</TH>}
          <TH className="text-right">Post-AI</TH>
          <TH className="text-right">Improvement</TH>
          {showBenchmark && <TH className="text-right">Benchmark (illustrative)</TH>}
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.metric}>
            <TD className="font-medium">{r.metric}</TD>
            <TD className="text-right">{r.baseline}</TD>
            {showTarget && <TD className="text-right text-muted-foreground">{r.target ?? "—"}</TD>}
            <TD className="text-right font-medium">{r.actual}</TD>
            <TD className={cn("text-right font-semibold", r.good === true && "text-[#006300]", r.good === false && "text-red-700")}>
              <span className="inline-flex items-center gap-1">
                {r.improvement}
                {r.explain && <ExplainButton metric={r.explain} />}
              </span>
            </TD>
            {showBenchmark && <TD className="text-right text-muted-foreground">{r.benchmark ?? "—"}</TD>}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
