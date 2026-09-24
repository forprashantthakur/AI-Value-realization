import type {
  AutomationMode,
  BenefitNature,
  BenefitStatus,
  Confidence,
  FinancialClass,
  Health,
  LifecycleStage,
  ValueCategory,
} from "./types";

export const STAGE_LABEL: Record<LifecycleStage, string> = {
  DISCOVER: "Discover",
  BASELINE: "Baseline",
  BUSINESS_CASE: "Business Case",
  IMPLEMENT: "Implement",
  MEASURE: "Measure",
  VALIDATE: "Validate",
  REALIZE: "Realize",
  OPTIMIZE: "Optimize",
};

export const STAGE_GATE: Record<LifecycleStage, string> = {
  DISCOVER: "Use case, owner and hypothesis defined",
  BASELINE: "Baseline KPIs captured with evidence and reconciled",
  BUSINESS_CASE: "Business case approved (targets, TCO, disposition, attribution)",
  IMPLEMENT: "Agents deployed; telemetry and cost tagging live",
  MEASURE: "Post-AI KPIs captured on same definitions as baseline",
  VALIDATE: "Business owner and Finance validation of benefits",
  REALIZE: "AI Value Office confirms realized value in P&L",
  OPTIMIZE: "Sustained ≥ 2 quarters; optimisation backlog active",
};

export const HEALTH_LABEL: Record<Health, string> = { ON_TRACK: "On track", AT_RISK: "At risk", OFF_TRACK: "Off track" };

export const STATUS_LABEL: Record<BenefitStatus, string> = {
  PROPOSED: "Proposed",
  MEASURED: "Measured",
  BUSINESS_VALIDATED: "Business validated",
  FINANCE_VALIDATED: "Finance validated",
  REALIZED: "Realized",
  SUSTAINED: "Sustained",
};

export const NATURE_LABEL: Record<BenefitNature, string> = { MEASURED: "Measured", ESTIMATED: "Estimated", INTANGIBLE: "Intangible" };

export const CLASS_LABEL: Record<FinancialClass, string> = {
  CASHABLE: "Cashable savings",
  COST_AVOIDANCE: "Cost avoidance",
  REVENUE: "Revenue / margin",
  WORKING_CAPITAL: "Working capital",
  RISK_AVOIDANCE: "Risk avoidance",
  CAPACITY: "Capacity (non-cash)",
  NON_FINANCIAL: "Non-financial",
};

export const CATEGORY_LABEL: Record<ValueCategory, string> = {
  PRODUCTIVITY: "Productivity",
  FINANCIAL: "Financial",
  QUALITY: "Quality",
  EXPERIENCE: "Experience",
  RISK_COMPLIANCE: "Risk & Compliance",
  STRATEGIC: "Strategic",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = { HIGH: "High confidence", MEDIUM: "Medium confidence", LOW: "Low confidence" };

export const MODE_LABEL: Record<AutomationMode, string> = {
  MANUAL: "Manual",
  RULES_BASED: "Rules-based automation",
  RPA: "RPA",
  AI_ASSISTED: "AI-assisted",
  AI_AUTOMATED: "AI-automated",
  AGENT_EXECUTED: "Agent-executed",
  HUMAN_IN_THE_LOOP: "Human-in-the-loop",
  HUMAN_APPROVED: "Human-approved",
};
