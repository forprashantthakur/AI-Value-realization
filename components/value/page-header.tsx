import { cn } from "@/lib/utils";

export const EXEC_QUESTIONS = {
  invest: "Q1 · How much are we investing in AI?",
  outcomes: "Q2 · What business outcomes are changing?",
  realized: "Q3 · How much value has actually been realized?",
  attribution: "Q4 · How much can credibly be attributed to AI?",
  leakage: "Q5 · Where is value leaking?",
  next: "Q6 · What should management investigate next?",
} as const;

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function QuestionTag({ q }: { q: keyof typeof EXEC_QUESTIONS }) {
  return <span className="inline-flex items-center rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary">{EXEC_QUESTIONS[q]}</span>;
}

export function SectionCard({
  title,
  description,
  q,
  actions,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  q?: keyof typeof EXEC_QUESTIONS;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pb-1 pt-3.5">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="section-title">{title}</h2>
            {q && <QuestionTag q={q} />}
          </div>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="px-4 pb-4 pt-2">{children}</div>
    </section>
  );
}
