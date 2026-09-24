import { useSyncExternalStore } from "react";
import { getLocation, navigate, NotFoundSignal, RedirectSignal, refresh, subscribe } from "../router";

export function useRouter() {
  return { push: (h: string) => navigate(h), replace: (h: string) => navigate(h), refresh, back: () => history.back(), prefetch: () => {} };
}
export function usePathname() {
  return useSyncExternalStore(subscribe, () => getLocation().path);
}
export function useSearchParams() {
  return useSyncExternalStore(subscribe, () => getLocation().query);
}
export function notFound(): never {
  throw new NotFoundSignal();
}
export function redirect(href: string): never {
  throw new RedirectSignal(href);
}
