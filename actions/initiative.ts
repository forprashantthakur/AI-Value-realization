"use server";
import { z } from "zod";
import type { AiAgent, Benefit, CostItem, Initiative, MetricSnapshot, ProcessMetrics } from "@/lib/domain/types";
import {
  AgentSchema,
  AttributionSchema,
  CostSchema,
  DispositionSchema,
  EvidenceSchema,
  InitiativePatchSchema,
  ScenarioSchema,
  SnapshotInputSchema,
  TransitionSchema,
} from "@/lib/domain/schemas";
import { canTransition } from "@/lib/auth/rbac";
import { auditEntry, diffAudit, mutate } from "@/lib/services/mutation";
import type { ValueRepository } from "@/lib/data";

async function getInit(repo: ValueRepository, id: string): Promise<Initiative> {
  const p = await repo.loadPortfolio();
  const i = p.initiatives.find((x) => x.id === id);
  if (!i) throw new Error("Initiative not found");
  return i;
}

async function findBenefit(repo: ValueRepository, benefitId: string) {
  const p = await repo.loadPortfolio();
  for (const i of p.initiatives) {
    const b = i.benefits.find((x) => x.id === benefitId);
    if (b) return { p, i, b };
  }
  throw new Error("Benefit not found");
}

export async function saveSnapshotAction(input: unknown) {
  return mutate("measurement:edit", async (repo, s) => {
    const v = SnapshotInputSchema.parse(input);
    const init = await getInit(repo, v.initiativeId);
    const prev = v.kind === "BASELINE" ? init.baseline : v.kind === "TARGET" ? init.target : init.actual;
    const snap: MetricSnapshot = { ...v, metrics: v.metrics as ProcessMetrics };
    await repo.saveSnapshot(v.initiativeId, snap);
    return { audit: diffAudit(s, `MetricSnapshot:${v.kind}`, `${v.initiativeId}-${v.kind}`, v.initiativeId, prev?.metrics as unknown as Record<string, unknown>, v.metrics, `${v.kind.toLowerCase()} measurement saved (${v.source})`) };
  });
}

export async function updateInitiativeAction(id: string, patch: unknown) {
  return mutate("initiative:edit", async (repo, s) => {
    const v = InitiativePatchSchema.parse(patch);
    const init = await getInit(repo, id);
    await repo.updateInitiative(id, v);
    return { audit: diffAudit(s, "Initiative", id, id, init as unknown as Record<string, unknown>, v) };
  });
}

export async function saveDispositionAction(initiativeId: string, d: unknown) {
  return mutate("initiative:edit", async (repo, s) => {
    const v = DispositionSchema.parse(d);
    const init = await getInit(repo, initiativeId);
    await repo.saveDisposition(initiativeId, v);
    return { audit: diffAudit(s, "CapacityDisposition", initiativeId, initiativeId, init.disposition as unknown as Record<string, unknown>, v) };
  });
}

/** Governance transition. Enforces the configurable workflow (role + evidence requirement). */
export async function transitionBenefitAction(input: unknown) {
  return mutate("portfolio:view", async (repo, s) => {
    const v = TransitionSchema.parse(input);
    const { p, i, b } = await findBenefit(repo, v.benefitId);
    const step = canTransition(s.role, b.status, v.to, p.settings.governance);
    const isRejection = ["PROPOSED", "MEASURED", "BUSINESS_VALIDATED"].includes(v.to) && v.to !== b.status && b.status !== "PROPOSED";
    if (!step && !(isRejection && ["FINANCE_VALIDATOR", "BUSINESS_OWNER", "AI_VALUE_OFFICE", "ENTERPRISE_ADMIN"].includes(s.role)))
      throw new Error(`Your role (${s.role.replaceAll("_", " ").toLowerCase()}) cannot move this benefit from ${b.status} to ${v.to}.`);
    if (step?.requiresEvidence && b.evidence.length === 0) throw new Error("Evidence is required before this step. Attach evidence first.");
    if (!i.actual && step && v.to !== "PROPOSED") throw new Error("No post-AI measurement exists yet — estimated benefits cannot be marked measured or validated.");
    const updated: Benefit = {
      ...b,
      status: v.to,
      history: [...b.history, { id: `h-${Date.now()}`, from: b.status, to: v.to, by: s.name, role: s.role, date: new Date().toISOString().slice(0, 10), comment: v.comment }],
    };
    await repo.saveBenefit(updated);
    return { audit: [auditEntry(s, { entity: "Benefit", entityId: b.id, initiativeId: i.id, field: "status", previous: b.status, next: v.to, reason: v.comment })] };
  });
}

export async function addEvidenceAction(benefitId: string, input: unknown) {
  return mutate("benefit:submit", async (repo, s) => {
    const v = EvidenceSchema.parse(input);
    const { i, b } = await findBenefit(repo, benefitId);
    const ev = { id: `ev-${Date.now()}`, ...v, providedBy: s.name, date: new Date().toISOString().slice(0, 10) };
    await repo.saveBenefit({ ...b, evidence: [...b.evidence, ev] });
    return { audit: [auditEntry(s, { entity: "Evidence", entityId: ev.id, initiativeId: i.id, field: "evidence", previous: null, next: `${v.type}: ${v.description}` })] };
  });
}

export async function updateAttributionAction(input: unknown) {
  return mutate("benefit:submit", async (repo, s) => {
    const v = AttributionSchema.parse(input);
    const { i, b } = await findBenefit(repo, v.benefitId);
    await repo.saveBenefit({ ...b, attributionPct: v.attributionPct, confidence: v.confidence });
    return { audit: diffAudit(s, "Benefit", b.id, i.id, { attributionPct: b.attributionPct, confidence: b.confidence }, { attributionPct: v.attributionPct, confidence: v.confidence }) };
  });
}

export async function upsertCostAction(input: unknown) {
  return mutate("cost:edit", async (repo, s) => {
    const v = CostSchema.parse(input);
    const init = await getInit(repo, v.initiativeId);
    const prev = init.costs.find((c) => c.id === v.id);
    const item: CostItem = { ...v, id: v.id ?? `cost-${Date.now()}` };
    await repo.upsertCost(item);
    return { audit: diffAudit(s, "CostItem", item.id, item.initiativeId, prev as unknown as Record<string, unknown>, { subcategory: item.subcategory, recurrence: item.recurrence, amount: item.amount }) };
  });
}

export async function deleteCostAction(initiativeId: string, costId: string) {
  return mutate("cost:edit", async (repo, s) => {
    const init = await getInit(repo, initiativeId);
    const prev = init.costs.find((c) => c.id === costId);
    await repo.deleteCost(costId);
    return { audit: [auditEntry(s, { entity: "CostItem", entityId: costId, initiativeId, field: "deleted", previous: prev ? `${prev.subcategory} ${prev.amount}` : null, next: null })] };
  });
}

export async function upsertAgentAction(input: unknown) {
  return mutate("initiative:edit", async (repo, s) => {
    const v = AgentSchema.parse(input);
    const init = await getInit(repo, v.initiativeId);
    const prev = init.agents.find((a) => a.id === v.id);
    const agent: AiAgent = { ...v, id: v.id ?? `${v.initiativeId}-agent-${Date.now()}`, sequence: prev?.sequence ?? init.agents.length + 1 };
    await repo.upsertAgent(agent);
    return { audit: diffAudit(s, "AiAgent", agent.id, agent.initiativeId, prev as unknown as Record<string, unknown>, { name: agent.name, automationPct: agent.automationPct, status: agent.status, modelPriceId: agent.modelPriceId }) };
  });
}

export async function saveScenarioAction(input: unknown) {
  return mutate("scenario:edit", async (repo, s) => {
    const v = ScenarioSchema.parse(input);
    await repo.saveScenario({ id: `${v.initiativeId}-sc-${v.name}`, initiativeId: v.initiativeId, name: v.name, overrides: v.overrides, notes: v.notes });
    return { audit: [auditEntry(s, { entity: "Scenario", entityId: `${v.initiativeId}-${v.name}`, initiativeId: v.initiativeId, field: "overrides", previous: null, next: JSON.stringify(v.overrides) })] };
  });
}

const NewInitiativeSchema = z.object({
  code: z.string().min(3).max(12),
  name: z.string().min(3),
  description: z.string().min(5),
  organizationId: z.string(),
  businessUnitId: z.string(),
  functionId: z.string(),
  processId: z.string(),
  country: z.string().min(2),
  useCase: z.string().min(3),
  aiTechnology: z.string().min(2),
  owner: z.string().min(2),
  productOwner: z.string().min(2),
  complexity: z.number().int().min(1).max(5),
  strategicAlignment: z.number().int().min(1).max(5),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  productiveHoursPerFte: z.number().min(800).max(2400),
  costPerError: z.number().min(0),
  baseline: z.any(),
  target: z.any(),
  plannedAdoption: z.number().min(0).max(1),
  attributionPct: z.number().min(0).max(1),
});

/** Creates an initiative from the Baseline Assessment wizard (Discover → Baseline → Business Case). */
export async function createInitiativeAction(input: unknown) {
  return mutate<{ id: string }>("initiative:edit", async (repo, s) => {
    const v = NewInitiativeSchema.parse(input);
    const p = await repo.loadPortfolio();
    if (p.initiatives.some((i) => i.code === v.code)) throw new Error(`Code ${v.code} already exists`);
    const id = `ini-${v.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const today = new Date().toISOString().slice(0, 10);
    const baselineM = SnapshotInputSchema.shape.metrics.parse(v.baseline) as ProcessMetrics;
    const targetM = SnapshotInputSchema.shape.metrics.parse({ ...v.target, adoptionRate: v.plannedAdoption }) as ProcessMetrics;
    const benefit = (n: number, name: string, driver: "LABOR_CASHABLE" | "LABOR_COST_AVOIDANCE" | "LABOR_REDEPLOYED" | "QUALITY_COST", cls: Benefit["financialClass"], cat: Benefit["category"]): Benefit => ({
      id: `${id}-b${n}`,
      initiativeId: id,
      name,
      category: cat,
      financialClass: cls,
      nature: "ESTIMATED",
      source: { kind: "DERIVED", driver },
      attributionPct: v.attributionPct,
      confidence: "LOW",
      status: "PROPOSED",
      owner: v.owner,
      measurementFrequency: "MONTHLY",
      evidence: [],
      history: [],
    });
    const init: Initiative = {
      id,
      code: v.code,
      name: v.name,
      description: v.description,
      organizationId: v.organizationId,
      businessUnitId: v.businessUnitId,
      functionId: v.functionId,
      processId: v.processId,
      country: v.country,
      stage: "BASELINE",
      health: "ON_TRACK",
      aiTechnology: v.aiTechnology,
      useCase: v.useCase,
      owner: v.owner,
      productOwner: v.productOwner,
      financeValidator: "",
      complexity: v.complexity,
      strategicAlignment: v.strategicAlignment,
      riskLevel: v.riskLevel,
      startDate: today,
      goLiveDate: null,
      productiveHoursPerFte: v.productiveHoursPerFte,
      costPerError: v.costPerError,
      laborBasis: "FTE_CALIBRATED",
      baseline: { kind: "BASELINE", asOf: today, source: "Baseline assessment wizard", owner: v.owner, metrics: baselineM },
      target: { kind: "TARGET", asOf: today, source: "Baseline assessment wizard (draft business case)", owner: v.productOwner, metrics: targetM },
      actual: null,
      kpis: [],
      series: [],
      agents: [],
      costs: [],
      disposition: { cashable: 0, costAvoidance: 0, redeployed: 0, revenueProducing: 0, unallocated: 1, rationale: "Not yet declared — capacity stays unallocated until the business owner commits." },
      benefits: [
        benefit(1, "Labour cost reduction (cashable)", "LABOR_CASHABLE", "CASHABLE", "FINANCIAL"),
        benefit(2, "Hiring avoided (cost avoidance)", "LABOR_COST_AVOIDANCE", "COST_AVOIDANCE", "FINANCIAL"),
        benefit(3, "Capacity redeployed", "LABOR_REDEPLOYED", "CAPACITY", "PRODUCTIVITY"),
        benefit(4, "Cost of poor quality avoided", "QUALITY_COST", "COST_AVOIDANCE", "QUALITY"),
      ],
      assumptions: [
        { id: `${id}-a1`, label: "Productive hours per FTE", value: `${v.productiveHoursPerFte} h/yr`, rationale: "Entered in baseline wizard", owner: v.owner },
        { id: `${id}-a2`, label: "AI attribution", value: `${Math.round(v.attributionPct * 100)}%`, rationale: "Initial estimate — to be agreed with Finance", owner: v.owner },
      ],
      scenarios: [],
      leakageNotes: [],
      businessCase: {
        approvedDate: null,
        approvedBy: null,
        sponsor: v.owner,
        problemStatement: v.description,
        objectives: [],
        potentialAdoption: 1,
        plannedAdoption: v.plannedAdoption,
        horizonYears: 3,
        approvedDeclaredBenefits: 0,
        approvedInvestment: 0,
      },
      tags: [],
    };
    await repo.createInitiative(init);
    return { data: { id }, audit: [auditEntry(s, { entity: "Initiative", entityId: id, initiativeId: id, field: "created", previous: null, next: v.name })] };
  });
}
