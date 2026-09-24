"use client";
import { useTransition } from "react";
import { UserRound } from "lucide-react";
import { switchPersona } from "@/app/actions/session";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PersonaSwitcher({ users, current }: { users: { id: string; name: string; role: string }[]; current: string }) {
  const [pending, start] = useTransition();
  return (
    <Select value={current} onValueChange={(v) => start(() => void switchPersona(v))} disabled={pending}>
      <SelectTrigger className="h-8 w-[230px] text-xs" aria-label="Signed-in persona">
        <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id} className="text-xs">
            {u.name} · <span className="text-muted-foreground">{u.role}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
