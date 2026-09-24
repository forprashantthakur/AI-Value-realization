import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileSpreadsheet, Sheet } from "lucide-react";
import { generateReport, isReportType } from "@/lib/reporting/service";
import { parseFilters } from "@/lib/services/portfolio-service";
import { getSession } from "@/lib/auth/session";
import { WaterfallChart } from "@/components/charts/charts";
import { PrintButton } from "@/components/value/print-button";
import { Button } from "@/components/ui/button";

export default async function ReportView({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { type } = await params;
  const sp = await searchParams;
  if (!isReportType(type)) notFound();
  const session = await getSession();
  const initiative = typeof sp.initiative === "string" ? sp.initiative : undefined;
  const r = await generateReport(type, parseFilters(sp), initiative, session.name);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  return (
    <div className="mx-auto max-w-[980px] space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Reports
        </Link>
        <div className="flex gap-2">
          <PrintButton />
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export?report=${type}&format=xlsx&${qs}`}>
              <FileSpreadsheet /> Excel
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export?report=${type}&format=csv&${qs}`}>
              <Sheet /> CSV
            </a>
          </Button>
        </div>
      </div>
      <article className="rounded-lg border bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="mb-6 border-b-2 border-[#1f3a8a] pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1f3a8a]">AI Value Realization Platform</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{r.title}</h1>
          <p className="text-sm text-muted-foreground">{r.subtitle}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Audience: {r.audience} · Scope: {r.scope} · Generated {r.generatedAt} by {r.generatedBy}
          </p>
        </header>
        <div className="space-y-7">
          {r.sections.map((s, i) => (
            <section key={i} className="print-avoid space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#1f3a8a]">
                <span className="text-[11px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              {s.kind === "text" && s.paragraphs.map((p, k) => <p key={k} className="text-sm leading-relaxed">{p}</p>)}
              {s.kind === "bullets" && (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {s.items.map((t, k) => (
                    <li key={k}>{t}</li>
                  ))}
                </ul>
              )}
              {s.kind === "kpis" && (
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
                  {s.items.map((k) => (
                    <div key={k.label} className="bg-white p-3">
                      <p className="text-[11px] text-muted-foreground">{k.label}</p>
                      <p className="text-lg font-semibold tabular">{k.value}</p>
                      {k.note && <p className="text-[10px] text-muted-foreground">{k.note}</p>}
                    </div>
                  ))}
                </div>
              )}
              {s.kind === "table" && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px] tabular">
                    <thead>
                      <tr className="bg-[#1f3a8a] text-white">
                        {s.columns.map((c) => (
                          <th key={c} className="px-2 py-1.5 text-left font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.rows.map((row, k) => (
                        <tr key={k} className="border-b even:bg-slate-50">
                          {row.map((c, j) => (
                            <td key={j} className="px-2 py-1">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {s.kind === "waterfall" && <WaterfallChart steps={s.steps} height={280} />}
              {"note" in s && s.note && <p className="text-[11px] italic text-muted-foreground">{s.note}</p>}
            </section>
          ))}
        </div>
        <footer className="mt-8 border-t pt-3 text-[10px] leading-relaxed text-muted-foreground">
          {r.disclaimer.map((d) => (
            <p key={d}>{d}</p>
          ))}
        </footer>
      </article>
    </div>
  );
}
