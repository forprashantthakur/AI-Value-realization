import type { BenefitStatus, GovernanceStep, Role } from "../domain/types";

export const PERMISSIONS = [
  "portfolio:view",
  "initiative:edit",
  "measurement:edit",
  "cost:edit",
  "benefit:submit",
  "scenario:edit",
  "settings:edit",
  "reference:manage",
  "users:manage",
  "data:import",
  "report:export",
  "audit:view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABEL: Record<Role, string> = {
  ENTERPRISE_ADMIN: "Enterprise Admin",
  AI_VALUE_OFFICE: "AI Value Office",
  FINANCE_VALIDATOR: "Finance Validator",
  BUSINESS_OWNER: "Business Owner",
  PROCESS_OWNER: "Process Owner",
  AI_PRODUCT_OWNER: "AI Product Owner",
  CONSULTANT: "Consultant",
  VIEWER: "Viewer",
};

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ENTERPRISE_ADMIN: [...PERMISSIONS],
  AI_VALUE_OFFICE: ["portfolio:view", "initiative:edit", "measurement:edit", "cost:edit", "benefit:submit", "scenario:edit", "settings:edit", "reference:manage", "data:import", "report:export", "audit:view"],
  FINANCE_VALIDATOR: ["portfolio:view", "cost:edit", "scenario:edit", "report:export", "audit:view"],
  BUSINESS_OWNER: ["portfolio:view", "initiative:edit", "scenario:edit", "report:export", "audit:view"],
  PROCESS_OWNER: ["portfolio:view", "initiative:edit", "measurement:edit", "benefit:submit", "data:import", "report:export", "audit:view"],
  AI_PRODUCT_OWNER: ["portfolio:view", "initiative:edit", "measurement:edit", "cost:edit", "benefit:submit", "scenario:edit", "data:import", "report:export", "audit:view"],
  CONSULTANT: ["portfolio:view", "initiative:edit", "measurement:edit", "scenario:edit", "data:import", "report:export", "audit:view"],
  VIEWER: ["portfolio:view", "report:export"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Governance: which status transitions a role may perform, per configurable workflow. */
export function allowedTransitions(role: Role, from: BenefitStatus, steps: GovernanceStep[]): GovernanceStep[] {
  return steps.filter((s) => s.from === from && s.allowedRoles.includes(role));
}

export function canTransition(role: Role, from: BenefitStatus, to: BenefitStatus, steps: GovernanceStep[]): GovernanceStep | null {
  return steps.find((s) => s.from === from && s.to === to && s.allowedRoles.includes(role)) ?? null;
}
