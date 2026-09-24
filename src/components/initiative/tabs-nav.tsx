"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { INITIATIVE_TABS } from "./tabs";



export function InitiativeTabs({ id }: { id: string }) {
  const path = usePathname();
  return (
    <nav className="no-print -mx-1 flex gap-1 overflow-x-auto border-b px-1" aria-label="Initiative sections">
      {INITIATIVE_TABS.map(([slug, label]) => {
        const href = `/initiatives/${id}/${slug}`;
        const active = path === href;
        return (
          <Link
            key={slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 border-transparent px-2.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground",
              active && "border-primary text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
