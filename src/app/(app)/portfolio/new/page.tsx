import { loadPortfolio } from "@/lib/services/portfolio-service";
import { PageHeader } from "@/components/value/page-header";
import { BaselineWizard } from "@/components/initiative/baseline-wizard";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { EmptyState } from "@/components/ui/misc";

export const metadata = { title: "New initiative — Baseline assessment" };

export default async function NewInitiativePage() {
  const [p, s] = await Promise.all([loadPortfolio(), getSession()]);
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Discover → Baseline" title="Baseline assessment wizard" description="Capture the process before AI so value can be measured after. Every later benefit is computed against these numbers." />
      {can(s.role, "initiative:edit") ? (
        <BaselineWizard
          organizations={p.organizations}
          businessUnits={p.businessUnits}
          functions={p.functions.filter((f) => f.isActive)}
          processes={p.processes}
          industries={p.industries}
          defaultProductiveHours={p.settings.defaultProductiveHours}
          owner={s.name}
        />
      ) : (
        <EmptyState title="Your role cannot create initiatives" description="Switch persona (top right) to an AI Product Owner, Process Owner, Consultant or AI Value Office user." />
      )}
    </div>
  );
}
