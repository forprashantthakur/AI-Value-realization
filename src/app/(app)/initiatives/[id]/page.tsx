import { redirect } from "next/navigation";

export default async function InitiativeIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/initiatives/${id}/overview`);
}
