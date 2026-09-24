"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FilePlus2, Loader2, Undo2 } from "lucide-react";
import type { BenefitStatus, EvidenceType, GovernanceStep, Role } from "@/lib/domain/types";
import { EVIDENCE_TYPES } from "@/lib/domain/types";
import { STATUS_LABEL } from "@/lib/domain/labels";
import { addEvidenceAction, transitionBenefitAction, updateAttributionAction } from "@/app/actions/initiative";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PREV: Partial<Record<BenefitStatus, BenefitStatus>> = {
  MEASURED: "PROPOSED",
  BUSINESS_VALIDATED: "MEASURED",
  FINANCE_VALIDATED: "BUSINESS_VALIDATED",
};

export function BenefitActions({
  benefitId,
  status,
  role,
  steps,
  evidenceCount,
  attributionPct,
  confidence,
  canSubmit,
}: {
  benefitId: string;
  status: BenefitStatus;
  role: Role;
  steps: GovernanceStep[];
  evidenceCount: number;
  attributionPct: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const next = steps.find((s) => s.from === status && s.allowedRoles.includes(role));
  const canReject = !!PREV[status] && ["FINANCE_VALIDATOR", "BUSINESS_OWNER", "AI_VALUE_OFFICE", "ENTERPRISE_ADMIN"].includes(role);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {next && <TransitionDialog benefitId={benefitId} to={next.to} label={next.label} requiresEvidence={next.requiresEvidence && evidenceCount === 0} />}
      {canReject && <TransitionDialog benefitId={benefitId} to={PREV[status]!} label={`Return to ${STATUS_LABEL[PREV[status]!]}`} reject />}
      {canSubmit && <EvidenceDialog benefitId={benefitId} />}
      {canSubmit && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
              Attribution
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>AI attribution</DialogTitle>
              <DialogDescription>Share of the observed improvement credibly caused by AI (vs. concurrent process, policy or volume changes).</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                start(async () => {
                  const r = await updateAttributionAction({ benefitId, attributionPct: Number(f.get("pct")) / 100, confidence: f.get("conf") });
                  if (!r.ok) setErr(r.error);
                  else router.refresh();
                });
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="pct">Attribution %</Label>
                <Input id="pct" name="pct" type="number" min={0} max={100} step={1} defaultValue={Math.round(attributionPct * 100)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="conf">Attribution confidence</Label>
                <select id="conf" name="conf" defaultValue={confidence} className="h-9 w-full rounded-md border px-2 text-sm">
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />} Save
              </Button>
              {err && <p className="text-xs text-red-700">{err}</p>}
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function TransitionDialog({ benefitId, to, label, requiresEvidence, reject }: { benefitId: string; to: BenefitStatus; label: string; requiresEvidence?: boolean; reject?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={reject ? "ghost" : "outline"} size="sm" className="h-7 px-2 text-[11px]" title={label}>
          {reject ? <Undo2 /> : <ArrowRight />}
          {reject ? "Return" : STATUS_LABEL[to]}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {reject ? "Send the benefit back one governance step." : `Move this benefit to “${STATUS_LABEL[to]}”.`} Your name, role and comment are recorded in the audit trail.
          </DialogDescription>
        </DialogHeader>
        {requiresEvidence && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">This step requires evidence. Attach evidence first — the request will be rejected otherwise.</p>}
        <div className="space-y-1">
          <Label htmlFor="c">Justification</Label>
          <Textarea id="c" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Reconciled to cost-centre actuals for Jun–Aug" />
        </div>
        {err && <p className="text-xs text-red-700">{err}</p>}
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await transitionBenefitAction({ benefitId, to, comment });
              if (!r.ok) setErr(r.error);
              else {
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />} Confirm
        </Button>
      </DialogContent>
    </Dialog>
  );
}

const EV_LABEL: Record<EvidenceType, string> = {
  SYSTEM_TELEMETRY: "System telemetry",
  PROCESS_MINING: "Process mining",
  FINANCE_VALIDATED: "Finance validated",
  BUSINESS_OWNER_VALIDATED: "Business owner validated",
  SURVEY: "Survey",
  ESTIMATED: "Estimated",
  BENCHMARK: "Benchmark",
};

export function EvidenceDialog({ benefitId }: { benefitId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
          <FilePlus2 /> Evidence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attach evidence</DialogTitle>
          <DialogDescription>Evidence strengthens the data-confidence rating and is required for governance steps.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await addEvidenceAction(benefitId, {
                type: f.get("type"),
                description: f.get("description"),
                reference: f.get("reference"),
                sampleSize: f.get("n") ? Number(f.get("n")) : undefined,
              });
              if (!r.ok) setErr(r.error);
              else {
                setOpen(false);
                router.refresh();
              }
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="type">Evidence type</Label>
            <select id="type" name="type" className="h-9 w-full rounded-md border px-2 text-sm">
              {EVIDENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EV_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" required minLength={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="reference">Reference / link</Label>
              <Input id="reference" name="reference" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="n">Sample size</Label>
              <Input id="n" name="n" type="number" min={0} />
            </div>
          </div>
          {err && <p className="text-xs text-red-700">{err}</p>}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Attach
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
