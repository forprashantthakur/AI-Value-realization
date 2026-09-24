import * as React from "react";
import { createRoot } from "react-dom/client";
import { getLocation, navigate, NotFoundSignal, RedirectSignal, subscribe } from "./router";
import AppLayout from "@/app/(app)/layout";
import InitiativeLayout from "@/app/(app)/initiatives/[id]/layout";
import InitiativeTab from "@/app/(app)/initiatives/[id]/[tab]/page";
import Dashboard from "@/app/(app)/dashboard/page";
import Cockpit from "@/app/(app)/cockpit/page";
import Portfolio from "@/app/(app)/portfolio/page";
import NewInitiative from "@/app/(app)/portfolio/new/page";
import ValueRealization from "@/app/(app)/value-realization/page";
import Processes from "@/app/(app)/processes/page";
import Agents from "@/app/(app)/agents/page";
import BusinessCases from "@/app/(app)/business-cases/page";
import Measurements from "@/app/(app)/measurements/page";
import Benchmarks from "@/app/(app)/benchmarks/page";
import Scenarios from "@/app/(app)/scenarios/page";
import Reports from "@/app/(app)/reports/page";
import ReportView from "@/app/(app)/reports/[type]/page";
import ImportPage from "@/app/(app)/import/page";
import Admin from "@/app/(app)/admin/page";
import SettingsPage from "@/app/(app)/settings/page";
import { POST as advisorPost } from "@/app/api/advisor/route";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PageFn = (props: any) => Promise<React.ReactNode> | React.ReactNode;
const STATIC: Record<string, PageFn> = {
  "/dashboard": Dashboard,
  "/cockpit": Cockpit,
  "/portfolio": Portfolio,
  "/portfolio/new": NewInitiative,
  "/value-realization": ValueRealization,
  "/processes": Processes,
  "/agents": Agents,
  "/business-cases": BusinessCases,
  "/measurements": Measurements,
  "/benchmarks": Benchmarks,
  "/scenarios": Scenarios,
  "/reports": Reports,
  "/import": ImportPage,
  "/admin": Admin,
  "/settings": SettingsPage,
};

let toastFn: (m: string) => void = () => {};

// Route the advisor API to the same handler code, in the browser.
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("/api/advisor")) return advisorPost(new Request("http://demo" + url, init));
  if (url.startsWith("/api/")) {
    toastFn("File import and export need the full app (npm run dev). This published demo runs entirely in your browser.");
    return new Response(JSON.stringify({ error: "Not available in the published demo — run the app locally for imports and exports." }), { status: 501 });
  }
  return realFetch(input, init);
};

async function resolve(path: string, query: URLSearchParams): Promise<React.ReactNode> {
  const sp = Promise.resolve(Object.fromEntries(query.entries()));
  const seg = path.split("/").filter(Boolean);
  let page: React.ReactNode;
  if (seg[0] === "initiatives" && seg[1]) {
    const tab = seg[2] ?? "overview";
    const params = Promise.resolve({ id: seg[1], tab });
    const content = await InitiativeTab({ params, searchParams: sp });
    page = await InitiativeLayout({ params, children: content });
  } else if (seg[0] === "reports" && seg[1]) {
    page = await ReportView({ params: Promise.resolve({ type: seg[1] }), searchParams: sp });
  } else {
    const fn = STATIC[path];
    if (!fn) throw new NotFoundSignal();
    page = await fn({ searchParams: sp, params: Promise.resolve({}) });
  }
  return AppLayout({ children: page });
}

function App() {
  const [node, setNode] = React.useState<React.ReactNode>(null);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState<string | null>(null);
  toastFn = (m) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 5000);
  };
  React.useEffect(() => {
    let seq = 0;
    const run = async () => {
      const my = ++seq;
      setLoading(true);
      const { path, query } = getLocation();
      try {
        const n = await resolve(path, query);
        if (my === seq) setNode(n);
      } catch (e) {
        if (e instanceof RedirectSignal) return navigate(e.href);
        const msg = e instanceof NotFoundSignal ? "Page not found." : e instanceof Error ? e.message : String(e);
        const back = await AppLayout({
          children: (
            <div className="rounded-lg border bg-card p-6 text-sm">
              <p className="font-medium">{msg}</p>
              <a href="/dashboard" className="text-primary underline">
                Back to the Executive Dashboard
              </a>
            </div>
          ),
        });
        if (my === seq) setNode(back);
      } finally {
        if (my === seq) setLoading(false);
      }
    };
    void run();
    return subscribe(() => void run());
  }, []);

  // Intercept in-app links and GET forms (plain <a>/<form> elements in the page code).
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a || e.defaultPrevented) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      e.preventDefault();
      if (href.startsWith("/api/")) return toastFn("Excel/CSV exports need the full app (npm run dev). In this published demo, open the report view instead.");
      navigate(href);
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      const action = f.getAttribute("action");
      if (!action || !action.startsWith("/")) return;
      e.preventDefault();
      const q = new URLSearchParams();
      new FormData(f).forEach((v, k) => typeof v === "string" && v && q.set(k, v));
      navigate(`${action}?${q.toString()}`);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-[#1b2a4a] px-4 py-1.5 text-center text-[11px] text-white/85">
        <span>Published demo — the full platform runs in your browser on fictional data. Changes last until you reload.</span>
        <span className="text-white/60">File import/export and PostgreSQL need the full app.</span>
      </div>
      {node}
      {loading && (
        <div className="fixed right-4 top-14 z-50 rounded-md border bg-card px-3 py-1.5 text-xs shadow-md" role="status">
          Calculating…
        </div>
      )}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-md bg-slate-900 px-4 py-2.5 text-xs text-white shadow-lg" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

const TOKENS: Record<string, string> = {
  dashboard: "/dashboard", cockpit: "/cockpit", portfolio: "/portfolio", "value-realization": "/value-realization", processes: "/processes",
  agents: "/agents", "business-cases": "/business-cases", measurements: "/measurements", benchmarks: "/benchmarks", scenarios: "/scenarios",
  reports: "/reports", import: "/import", admin: "/admin", settings: "/settings", s2p: "/initiatives/ini-s2p/overview",
};
const h = location.hash.replace("#", "");
if (TOKENS[h]) navigate(TOKENS[h]);
createRoot(document.getElementById("root")!).render(<App />);
