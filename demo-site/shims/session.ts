import type { Role, User } from "@/lib/domain/types";
import { can, type Permission } from "@/lib/auth/rbac";

export interface Session {
  userId: string;
  name: string;
  role: Role;
  title: string;
}
let current: Session = { userId: "u-avo", name: "Daniel Okafor", role: "AI_VALUE_OFFICE", title: "Head of AI Value Office" };

export async function getSession(): Promise<Session> {
  return current;
}
export function toSession(u: User): Session {
  return { userId: u.id, name: u.name, role: u.role, title: u.title };
}
export async function signIn(u: User) {
  current = toSession(u);
}
export class ForbiddenError extends Error {
  constructor(permission: string) {
    super(`Your role does not have permission: ${permission}`);
  }
}
export async function requirePermission(permission: Permission): Promise<Session> {
  if (!can(current.role, permission)) throw new ForbiddenError(permission);
  return current;
}
