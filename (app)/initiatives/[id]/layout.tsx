import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { evaluateOne } from "@/lib/services/portfolio-service";
import { InitiativeTabs } from "@/components/initiative/tabs-nav";
import { ConfidenceBadge, HealthBadge, StageBadge } from "@/components/value/badges";
import { fmtMetric, money } from "@/lib/format";

export default async function InitiativeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await evaluateOne(id);
  if (!r) notFound();
  const { portfolio: p, init, value: v } = r;
  const org = p.organizations.find((o) => o.id === init.organizationId);
  const fn = p.functions.find((f) => f.id === init.functionId);
  const proc = p.processes.find((x) => x.id === init.processId);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Link href="/portfolio" className="no-print inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> AI Portfolio
        </Link>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="eyebrow">
              {init.code} · {org?.name} · {fn?.name} › {proc?.name}
            </p>
            <h1 className="page-title">{init.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <StageBadge stage={init.stage} />
              <HealthBadge health={init.health} />
              <ConfidenceBadge level={v.confidence} />
              <span className="text-xs text-muted-foreground">
                {init.aiTechnology} · {init.agents.length} agent{init.agents.length === 1 ? "" : "s"} · Owner {init.owner}
              </span>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Net benefit / yr</dt>
              <dd className="text-base font-semibold tabular">{v.isForecast ? <span className="text-muted-foreground">{money(v.roi.netAnnualBenefit.value)}*</span> : money(v.roi.netAnnualBenefit.value)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ROI ({init.businessCase.horizonYears}-yr)</dt>
              <dd className="text-base font-semibold tabular">{fmtMetric(v.roi.roi, 0)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Payback</dt>
              <dd className="text-base font-semibold tabular">{fmtMetric(v.roi.paybackMonths)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Finance-validated</dt>
              <dd className="text-base font-semibold tabular">{money(v.leakage.ladder.FINANCE_VALIDATED)}</dd>
            </div>
          </dl>
        </div>
        {v.isForecast && (
          <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            * No post-AI measurement yet. All values are <strong>forecast</strong> from business-case targets and are not realized value.
          </p>
        )}
      </div>
      <InitiativeTabs id={init.id} />
      {children}
    </div>
  );
}
