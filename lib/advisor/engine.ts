import type { Portfolio } from "../domain/types";
import { evaluateInitiative, summarizePortfolio, LEAKAGE_CAUSE_LABEL, type EvaluatedInitiative } from "../value-engine";
import { money, pct } from "../format";
import type { AdvisorAnswer } from "./types";

type Handler = {
  intent: string;
  match: RegExp;
  run: (q: string, ctx: Ctx, m: RegExpMatchArray) => Omit<AdvisorAnswer, "question" | "narratedBy">;
};

interface Ctx {
  p: Portfolio;
  items: EvaluatedInitiative[];
}

const live = (e: EvaluatedInitiative) => !!e.init.actual;
const link = (e: EvaluatedInitiative) => ({ label: `${e.init.code} · ${e.init.name}`, href: `/initiatives/${e.init.id}/overview` });

function findFunction(q: string, p: Portfolio) {
  const lq = q.toLowerCase();
  return p.functions.find((f) => lq.includes(f.name.toLowerCase()) || lq.includes(f.id.replace("-", " ")) || (f.id === "hr" && /\bhr\b|human resources/.test(lq)));
}

function findInitiative(q: string, items: EvaluatedInitiative[]) {
  const lq = q.toLowerCase();
  const scored = items
    .map((e) => {
      const words = `${e.init.name} ${e.init.code} ${e.init.useCase}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && w !== "agent");
      return { e, score: words.filter((w) => lq.includes(w)).length + (lq.includes(e.init.code.toLowerCase()) ? 5 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].e : null;
}

const HANDLERS: Handler[] = [
  {
    intent: "top_validated",
    match: /(highest|top|most).*(validated|realized|realised)|(validated|realized).*(highest|top|most)/i,
    run: (_q, { items }) => {
      const rows = items
        .filter(live)
        .map((e) => ({ e, v: e.value.totals.byStatusFloor.FINANCE_VALIDATED }))
        .sort((a, b) => b.v - a.v)
        .slice(0, 5);
      const top = rows[0];
      return {
        intent: "top_validated",
        text: top
          ? `${top.e.init.name} has the highest finance-validated benefit at ${money(top.v)} per year (AI-attributed, status ≥ Finance Validated).`
          : "No initiative has finance-validated benefits yet.",
        table: { columns: ["Initiative", "Finance-validated / yr", "Gross run-rate / yr", "Confidence"], rows: rows.map((r) => [r.e.init.name, money(r.v), money(r.e.value.totals.counted), r.e.value.confidence]) },
        links: rows.slice(0, 3).map((r) => link(r.e)),
        facts: Object.fromEntries(rows.map((r) => [r.e.init.code, money(r.v)])),
      };
    },
  },
  {
    intent: "leakage",
    match: /(losing|leak|leakage|lost).*(value)?|where.*value.*(go|lost)/i,
    run: (_q, { p, items }) => {
      const s = summarizePortfolio(items, p.settings);
      const causes = Object.entries(s.leakageByCause)
        .filter(([k, v]) => (v ?? 0) < 0 && k !== "ADOPTION_HEADROOM" && k !== "AWAITING_VALIDATION")
        .sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
      const awaiting = -(s.leakageByCause.AWAITING_VALIDATION ?? 0);
      const worst = items
        .filter(live)
        .map((e) => ({ e, gap: e.value.leakage.ladder.BUSINESS_CASE - e.value.leakage.ladder.CURRENT_RUN_RATE }))
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 5);
      return {
        intent: "leakage",
        text: `Across the portfolio, business-case value is ${money(s.ladder.BUSINESS_CASE)} and current run-rate is ${money(s.ladder.CURRENT_RUN_RATE)}; ${money(s.ladder.FINANCE_VALIDATED)} is finance-validated. The largest operational leakage driver is ${causes[0] ? LEAKAGE_CAUSE_LABEL[causes[0][0] as keyof typeof LEAKAGE_CAUSE_LABEL].toLowerCase() : "n/a"} (${causes[0] ? money(causes[0][1] ?? 0) : "—"}); a further ${money(awaiting)} is measured but not yet finance-validated.`,
        bullets: causes.slice(0, 5).map(([k, v]) => `${LEAKAGE_CAUSE_LABEL[k as keyof typeof LEAKAGE_CAUSE_LABEL]}: ${money(v ?? 0)}`),
        table: { columns: ["Initiative", "Business case", "Current run-rate", "Gap"], rows: worst.map((w) => [w.e.init.name, money(w.e.value.leakage.ladder.BUSINESS_CASE), money(w.e.value.leakage.ladder.CURRENT_RUN_RATE), money(w.gap)]) },
        links: [{ label: "Open Value Cockpit", href: "/cockpit" }, ...worst.slice(0, 2).map((w) => link(w.e))],
        facts: { bc: money(s.ladder.BUSINESS_CASE), cur: money(s.ladder.CURRENT_RUN_RATE), fv: money(s.ladder.FINANCE_VALIDATED) },
      };
    },
  },
  {
    intent: "low_adoption",
    match: /(low|poor|weak).*adoption|adoption.*(low|below|lag)/i,
    run: (_q, { items }) => {
      const rows = items
        .filter(live)
        .map((e) => ({ e, a: e.value.post.adoptionRate, t: e.init.target.metrics.adoptionRate }))
        .sort((x, y) => x.a - x.t - (y.a - y.t))
        .filter((r) => r.a < r.t)
        .slice(0, 6);
      return {
        intent: "low_adoption",
        text: rows.length
          ? `${rows.length} live initiative(s) are below planned adoption. The largest gap is ${rows[0].e.init.name}: ${pct(rows[0].a)} actual vs ${pct(rows[0].t)} planned.`
          : "All live initiatives are at or above planned adoption.",
        table: { columns: ["Initiative", "Process", "Actual adoption", "Planned", "Gap (pts)"], rows: rows.map((r) => [r.e.init.name, r.e.init.useCase, pct(r.a), pct(r.t), ((r.a - r.t) * 100).toFixed(0)]) },
        links: rows.slice(0, 3).map((r) => link(r.e)),
        facts: Object.fromEntries(rows.map((r) => [r.e.init.code, pct(r.a)])),
      };
    },
  },
  {
    intent: "why_below_target",
    match: /why.*(below|under|miss|behind|low)/i,
    run: (q, { items }) => {
      const e = findInitiative(q, items) ?? items.filter(live).sort((a, b) => a.value.scorecard.dimensions[0].score - b.value.scorecard.dimensions[0].score)[0];
      if (!e) return { intent: "why_below_target", text: "I could not identify the initiative. Try including its name or code.", facts: {} as Record<string, string> };
      const v = e.value;
      const steps = v.leakage.steps.filter((s) => s.amount < 0 && s.key !== "adoption-headroom").sort((a, b) => a.amount - b.amount);
      const bcRoi = v.leakage.ladder.BUSINESS_CASE;
      return {
        intent: "why_below_target",
        text: `${e.init.name}: current attributed run-rate ${money(v.leakage.ladder.CURRENT_RUN_RATE)} vs business case ${money(bcRoi)}; ROI ${v.roi.roi.undefinedReason ? "n/a" : pct(v.roi.roi.value)}. One-time cost variance vs approval: ${money(v.leakage.costVariance)}.`,
        bullets: [
          ...steps.map((s) => `${s.label}: ${money(s.amount)} — ${s.explanation}`),
          ...v.leakage.qualitative.map((n) => `Owner note (${n.cause.replaceAll("_", " ").toLowerCase()}): ${n.description}${n.estimatedAnnualImpact ? ` (~${money(n.estimatedAnnualImpact)} estimated)` : ""}`),
        ],
        links: [link(e)],
        facts: { cur: money(v.leakage.ladder.CURRENT_RUN_RATE), bc: money(bcRoi) },
      };
    },
  },
  {
    intent: "ai_cost_sensitivity",
    match: /(ai|llm|model|run).*cost.*(increase|rise|up|grow|\+)\D*(\d+)\s*%|(\d+)\s*%.*(ai|llm).*cost/i,
    run: (q, { p, items }) => {
      const n = Number((q.match(/(\d+(?:\.\d+)?)\s*%/) ?? [])[1] ?? 30);
      const ctx = { settings: p.settings, modelPrices: p.modelPrices };
      const base = summarizePortfolio(items, p.settings);
      const shocked = items.map((e) => ({ init: e.init, value: evaluateInitiative(e.init, ctx, { aiCostChangePct: n / 100 }) }));
      const s2 = summarizePortfolio(shocked, p.settings);
      const flipped = shocked.filter((e) => e.init.actual && e.value.roi.netAnnualBenefit.value < 0).map((e) => e.init.name);
      return {
        intent: "ai_cost_sensitivity",
        text: `If recurring AI costs rise by ${n}%, portfolio net annual benefit moves from ${money(base.netBenefit.value)} to ${money(s2.netBenefit.value)} and ${p.settings.horizonYears}-year ROI from ${pct(base.roi.roi.value)} to ${pct(s2.roi.roi.value)}. Gross benefit is unchanged at ${money(base.grossBenefit.value)}.`,
        bullets: flipped.length ? [`Initiatives turning net-negative: ${flipped.join(", ")}`] : ["No live initiative turns net-negative at this cost level."],
        table: {
          columns: ["Initiative", "Net / yr (now)", `Net / yr (+${n}% AI cost)`, "ROI now", "ROI after"],
          rows: shocked
            .filter((e) => e.init.actual)
            .map((e) => {
              const b = items.find((x) => x.init.id === e.init.id)!;
              return [e.init.name, money(b.value.roi.netAnnualBenefit.value), money(e.value.roi.netAnnualBenefit.value), pct(b.value.roi.roi.value), pct(e.value.roi.roi.value)];
            }),
        },
        links: [{ label: "Open Scenario Analysis", href: "/scenarios" }],
        facts: { n: `${n}%`, net0: money(base.netBenefit.value), net1: money(s2.netBenefit.value) },
      };
    },
  },
  {
    intent: "capacity",
    match: /(capacity|fte|hours).*(released|freed|most|saved)|released.*capacity/i,
    run: (_q, { items }) => {
      const rows = items.filter(live).sort((a, b) => b.value.capacity.fteCapacityReleased.value - a.value.capacity.fteCapacityReleased.value).slice(0, 6);
      return {
        intent: "capacity",
        text: rows[0]
          ? `${rows[0].init.name} has released the most capacity: ${rows[0].value.capacity.fteCapacityReleased.value.toFixed(1)} FTE (${Math.round(rows[0].value.capacity.hoursReleased.value).toLocaleString("en-IN")} hours/yr). Capacity is not cash — see how much was declared cashable.`
          : "No live initiatives.",
        table: {
          columns: ["Initiative", "FTE capacity", "Cashable share", "Cost-avoidance share", "Redeployed share"],
          rows: rows.map((e) => [e.init.name, e.value.capacity.fteCapacityReleased.value.toFixed(1), pct(e.init.disposition.cashable), pct(e.init.disposition.costAvoidance), pct(e.init.disposition.redeployed)]),
        },
        links: rows.slice(0, 3).map(link),
        facts: {},
      };
    },
  },
  {
    intent: "payback_filter",
    match: /payback.*(under|below|less than|<)\s*(\d+)/i,
    run: (q, { p, items }, m) => {
      const months = Number(m[2]);
      const fn = findFunction(q, p);
      const rows = items
        .filter((e) => !fn || e.init.functionId === fn.id)
        .filter((e) => !e.value.roi.paybackMonths.undefinedReason && e.value.roi.paybackMonths.value < months)
        .sort((a, b) => a.value.roi.paybackMonths.value - b.value.roi.paybackMonths.value);
      return {
        intent: "payback_filter",
        text: `${rows.length} ${fn ? fn.name + " " : ""}initiative(s) have a simple payback under ${months} months${rows.some((r) => !r.init.actual) ? " (forecast-only initiatives are marked)" : ""}.`,
        table: {
          columns: ["Initiative", "Function", "Payback (months)", "ROI", "Basis"],
          rows: rows.map((e) => [e.init.name, p.functions.find((f) => f.id === e.init.functionId)?.name ?? "", e.value.roi.paybackMonths.value.toFixed(1), pct(e.value.roi.roi.value), e.init.actual ? "Measured" : "Forecast"]),
        },
        links: rows.slice(0, 3).map(link),
        facts: { months: String(months) },
      };
    },
  },
];

export const SUGGESTED_QUESTIONS = [
  "Which AI initiatives generated the highest validated benefit?",
  "Where are we losing AI value?",
  "Which processes have low adoption?",
  "Why is the Procurement Sourcing Agent below its ROI target?",
  "What happens if AI costs increase by 30%?",
  "Which processes have released the most capacity?",
  "Show Finance initiatives with payback under 12 months.",
];

/** Deterministic question answering over structured data. No numbers are generated outside the engine. */
export function answerDeterministic(question: string, p: Portfolio, items: EvaluatedInitiative[]): AdvisorAnswer {
  const ctx: Ctx = { p, items };
  for (const h of HANDLERS) {
    const m = question.match(h.match);
    if (m) return { question, narratedBy: "deterministic", ...h.run(question, ctx, m) };
  }
  return {
    question,
    intent: "help",
    narratedBy: "deterministic",
    text: "I answer questions from the platform's structured value data only. Try one of these:",
    bullets: SUGGESTED_QUESTIONS,
    facts: {},
  };
}
