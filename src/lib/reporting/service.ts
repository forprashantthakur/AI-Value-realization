import "server-only";
import { evaluatePortfolio, type Filters } from "../services/portfolio-service";
import { buildReport, REPORT_META, type ReportType } from "./builders";

export function isReportType(t: string): t is ReportType {
  return t in REPORT_META;
}

export async function generateReport(type: ReportType, filters: Filters, initiativeId: string | undefined, user: string) {
  const { portfolio, items, summary } = await evaluatePortfolio(filters);
  const scopeParts = [
    filters.org && portfolio.organizations.find((o) => o.id === filters.org)?.name,
    filters.industry && portfolio.industries.find((i) => i.id === filters.industry)?.name,
    filters.fn && portfolio.functions.find((f) => f.id === filters.fn)?.name,
  ].filter(Boolean);
  const init = initiativeId ? portfolio.initiatives.find((i) => i.id === initiativeId) : undefined;
  const scope = init ? `${init.code} · ${init.name}` : scopeParts.length ? scopeParts.join(" · ") : "All organizations";
  return buildReport(type, portfolio, items, summary, { initiativeId, user, scope });
}
