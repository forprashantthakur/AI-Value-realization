"use server";
import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/data";
import { signIn } from "@/lib/auth/session";

export async function switchPersona(userId: string) {
  const repo = await getRepository();
  const p = await repo.loadPortfolio();
  const u = p.users.find((x) => x.id === userId);
  if (!u) return { ok: false, error: "Unknown user" };
  await signIn(u);
  revalidatePath("/", "layout");
  return { ok: true };
}
