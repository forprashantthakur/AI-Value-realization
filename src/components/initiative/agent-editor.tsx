"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import type { AiAgent, ModelPrice } from "@/lib/domain/types";
import { AUTOMATION_MODES } from "@/lib/domain/types";
import { MODE_LABEL } from "@/lib/domain/labels";
import { upsertAgentAction } from "@/app/actions/initiative";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PERF_DEFAULT: AiAgent["performance"] = {
  tasksPerMonth: 1000,
  taskCompletionRate: 0.9,
  autonomousCompletionRate: 0.6,
  escalationRate: 0.3,
  overrideRate: 0.05,
  errorRate: 0.02,
  hallucinationEventsPerMonth: 0,
  toolCallSuccessRate: 0.97,
  avgLatencySeconds: 5,
  callsPerTask: 3,
  inputTokensPerCall: 4000,
  outputTokensPerCall: 600,
  cacheHitRate: 0.2,
  toolCallsPerTask: 2,
  humanMinutesPerEscalation: 8,
};

const PERF_FIELDS: { key: keyof AiAgent["performance"]; label: string; pct?: boolean }[] = [
  { key: "tasksPerMonth", label: "Tasks / month" },
  { key: "taskCompletionRate", label: "Task completion %", pct: true },
  { key: "autonomousCompletionRate", label: "Autonomous completion %", pct: true },
  { key: "escalationRate", label: "Escalation %", pct: true },
  { key: "overrideRate", label: "Human override %", pct: true },
  { key: "errorRate", label: "Agent error %", pct: true },
  { key: "hallucinationEventsPerMonth", label: "Hallucination events / mo" },
  { key: "toolCallSuccessRate", label: "Tool-call success %", pct: true },
  { key: "avgLatencySeconds", label: "Avg latency (s)" },
  { key: "callsPerTask", label: "LLM calls / task" },
  { key: "inputTokensPerCall", label: "Input tokens / call" },
  { key: "outputTokensPerCall", label: "Output tokens / call" },
  { key: "cacheHitRate", label: "Cache hit %", pct: true },
  { key: "toolCallsPerTask", label: "Tool calls / task" },
  { key: "humanMinutesPerEscalation", label: "Human min / escalation" },
];

export function AgentEditor({ initiativeId, modelPrices, agent }: { initiativeId: string; modelPrices: ModelPrice[]; agent?: AiAgent }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const a = agent;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {a ? (
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${a.name}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <Plus /> Add agent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{a ? `Edit ${a.name}` : "Add AI agent"}</DialogTitle>
          <DialogDescription>Design parameters and latest operational telemetry. Token economics use the configured model price (Admin → Model prices).</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const perf = Object.fromEntries(PERF_FIELDS.map((x) => [x.key, Number(f.get(x.key)) / (x.pct ? 100 : 1)])) as unknown as AiAgent["performance"];
            start(async () => {
              const r = await upsertAgentAction({
                id: a?.id,
                initiativeId,
                name: f.get("name"),
                description: f.get("description"),
                technology: f.get("technology"),
                modelPriceId: f.get("model") || null,
                humanInLoopModel: f.get("hitl"),
                automationPct: Number(f.get("automationPct")) / 100,
                tasksAutomated: String(f.get("automated") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
                tasksAugmented: String(f.get("augmented") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
                deploymentDate: f.get("deploymentDate"),
                status: f.get("status"),
                performance: { ...perf, hallucinationEventsPerMonth: Math.round(perf.hallucinationEventsPerMonth) },
              });
              if (!r.ok) setErr(r.error);
              else {
                setOpen(false);
                router.refresh();
              }
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Agent name" name="name" defaultValue={a?.name} required />
            <Field label="AI technology" name="technology" defaultValue={a?.technology ?? "Agentic AI"} required />
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" defaultValue={a?.description} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="model">LLM / model price tier</Label>
              <select id="model" name="model" defaultValue={a?.modelPriceId ?? ""} className="h-9 w-full rounded-md border px-2 text-sm">
                <option value="">Not configured</option>
                {modelPrices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hitl">Human-in-loop model</Label>
              <select id="hitl" name="hitl" defaultValue={a?.humanInLoopModel ?? "HUMAN_IN_THE_LOOP"} className="h-9 w-full rounded-md border px-2 text-sm">
                {AUTOMATION_MODES.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Tasks automated (comma-separated)" name="automated" defaultValue={a?.tasksAutomated.join(", ")} />
            <Field label="Tasks augmented (comma-separated)" name="augmented" defaultValue={a?.tasksAugmented.join(", ")} />
            <Field label="Designed automation %" name="automationPct" type="number" defaultValue={String(Math.round((a?.automationPct ?? 0.6) * 100))} />
            <Field label="Deployment date" name="deploymentDate" type="date" defaultValue={a?.deploymentDate ?? new Date().toISOString().slice(0, 10)} />
            <div className="space-y-1">
              <Label htmlFor="status">Status</Label>
              <select id="status" name="status" defaultValue={a?.status ?? "PLANNED"} className="h-9 w-full rounded-md border px-2 text-sm">
                <option value="PLANNED">Planned</option>
                <option value="PILOT">Pilot</option>
                <option value="LIVE">Live</option>
              </select>
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="section-title">Operational telemetry & token economics</legend>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {PERF_FIELDS.map((x) => {
                const val = (a?.performance ?? PERF_DEFAULT)[x.key];
                return <Field key={x.key} label={x.label} name={x.key} type="number" defaultValue={String(x.pct ? Math.round(val * 1000) / 10 : val)} />;
              })}
            </div>
          </fieldset>
          {err && <p className="text-xs text-red-700">{err}</p>}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Save agent
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, name, defaultValue, type = "text", required }: { label: string; name: string; defaultValue?: string; type?: string; required?: boolean }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-[11px]">
        {label}
      </Label>
      <Input id={name} name={name} type={type} step="any" defaultValue={defaultValue} required={required} className="h-8" />
    </div>
  );
}
