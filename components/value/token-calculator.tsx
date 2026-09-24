"use client";
import { useState } from "react";
import type { ModelPrice } from "@/lib/domain/types";
import { costPerTask } from "@/lib/value-engine/agent-economics";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money, num } from "@/lib/format";

/** AI FinOps calculator — same agent-economics functions as the engine. Prices come from configuration. */
export function TokenCalculator({ prices }: { prices: ModelPrice[] }) {
  const [s, setS] = useState({ model: prices[1]?.id ?? prices[0]?.id, inTok: 4000, outTok: 600, calls: 3, cache: 20, txPerMonth: 50000, agentsPerTx: 2, outcomesPerMonth: 45000 });
  const price = prices.find((p) => p.id === s.model);
  const perTask = price ? costPerTask({ inputTokensPerCall: s.inTok, outputTokensPerCall: s.outTok, callsPerTask: s.calls, cacheHitRate: s.cache / 100, price }) : 0;
  const perTx = perTask * s.agentsPerTx;
  const monthly = perTx * s.txPerMonth;
  const f = (k: keyof typeof s, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`tc-${k}`} className="text-[11px]">
        {label}
      </Label>
      <Input id={`tc-${k}`} type="number" min={0} className="h-8" value={s[k] as number} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="tc-model" className="text-[11px]">
            Model price (configured)
          </Label>
          <select id="tc-model" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} className="h-8 w-full rounded-md border px-2 text-xs">
            {prices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — in {p.inputPer1M}/out {p.outputPer1M} per 1M
              </option>
            ))}
          </select>
        </div>
        {f("inTok", "Input tokens / call")}
        {f("outTok", "Output tokens / call")}
        {f("calls", "Calls / task")}
        {f("cache", "Cache hit %")}
        {f("agentsPerTx", "Agent tasks / transaction")}
        {f("txPerMonth", "Transactions / month")}
        {f("outcomesPerMonth", "Successful outcomes / month")}
      </div>
      <dl className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-3 text-xs sm:grid-cols-5">
        {[
          ["AI cost / task", money(perTask, { compact: false })],
          ["AI cost / transaction", money(perTx, { compact: false })],
          ["Monthly LLM cost", money(monthly)],
          ["Annual LLM cost", money(monthly * 12)],
          ["Cost / business outcome", money(s.outcomesPerMonth ? monthly / s.outcomesPerMonth : 0, { compact: false })],
        ].map(([k, val]) => (
          <div key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-sm font-semibold tabular">{val}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-muted-foreground">
        Tokens / transaction: {num((s.inTok + s.outTok) * s.calls * s.agentsPerTx)}. {price?.isIllustrative ? "Selected price is an illustrative placeholder — configure contracted rates in Administration." : ""}
      </p>
    </div>
  );
}
