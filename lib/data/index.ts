import type { ValueRepository } from "./repository";
import { MemoryRepository } from "./memory-repository";

let repo: ValueRepository | null = null;

/**
 * Repository factory. DATA_SOURCE=prisma|memory; defaults to prisma when DATABASE_URL is set,
 * otherwise the in-memory demo repository (zero-setup mode).
 */
export async function getRepository(): Promise<ValueRepository> {
  if (repo) return repo;
  const mode = process.env.DATA_SOURCE ?? (process.env.DATABASE_URL ? "prisma" : "memory");
  if (mode === "prisma") {
    const { PrismaRepository } = await import("./prisma-repository");
    repo = new PrismaRepository();
  } else {
    repo = new MemoryRepository();
  }
  return repo;
}

export type { ValueRepository } from "./repository";
