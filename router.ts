/** Tiny in-memory router used by the published static demo (replaces Next.js routing). */
type Listener = () => void;
let current = { path: "/dashboard", query: new URLSearchParams() };
const listeners = new Set<Listener>();

export function getLocation() {
  return current;
}
export function navigate(href: string) {
  const u = new URL(href, "http://x");
  current = { path: u.pathname === "/" ? "/dashboard" : u.pathname.replace(/\/$/, ""), query: u.searchParams };
  const top = current.path.split("/")[1];
  try {
    if (/^[a-z-]+$/.test(top) && current.path.split("/").length === 2) history.replaceState(null, "", `#${top}`);
  } catch {
    /* ignore */
  }
  window.scrollTo({ top: 0 });
  listeners.forEach((l) => l());
}
export function refresh() {
  listeners.forEach((l) => l());
}
export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export class NotFoundSignal extends Error {}
export class RedirectSignal extends Error {
  constructor(public href: string) {
    super("redirect");
  }
}
