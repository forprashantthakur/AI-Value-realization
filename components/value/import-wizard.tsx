"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import { importMeasurementsAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Result {
  row: number;
  ok: boolean;
  data: Record<string, unknown>;
  error: string | null;
}

export function ImportWizard({ canImport }: { canImport: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<{ total: number; valid: number; results: Result[] } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const validate = () =>
    start(async () => {
      if (!file) return;
      setMsg(null);
      const fd = new FormData();
      fd.set("file", file);
      const r = await fetch("/api/import", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) setMsg({ ok: false, text: j.error });
      else setRes(j);
    });
  const commit = () =>
    start(async () => {
      if (!res) return;
      const rows = res.results.filter((r) => r.ok).map((r) => r.data);
      const out = await importMeasurementsAction(rows);
      if (out.ok) {
        setMsg({ ok: true, text: `Imported ${out.data?.imported ?? 0} rows. Values recalculated; audit trail updated.` });
        setRes(null);
        router.refresh();
      } else setMsg({ ok: false, text: out.error });
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <a href="/api/import/template">
            <Download /> Download CSV template
          </a>
        </Button>
        <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-muted", !canImport && "pointer-events-none opacity-50")}>
          <Upload className="h-3.5 w-3.5" />
          {file ? file.name : "Choose .csv or .xlsx"}
          <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={!canImport} />
        </label>
        <Button size="sm" onClick={validate} disabled={!file || pending || !canImport}>
          {pending ? <Loader2 className="animate-spin" /> : null} Validate
        </Button>
        {!canImport && <span className="text-xs text-muted-foreground">Your role cannot import data.</span>}
      </div>
      {res && (
        <div className="space-y-2">
          <p className="text-xs">
            {res.valid} of {res.total} rows valid.{" "}
            {res.valid < res.total && <span className="text-red-700">Invalid rows will be skipped.</span>}
          </p>
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-[11px] tabular">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1 text-left">Row</th>
                  <th className="px-2 py-1 text-left">Initiative</th>
                  <th className="px-2 py-1 text-left">Month</th>
                  <th className="px-2 py-1 text-right">Volume</th>
                  <th className="px-2 py-1 text-right">Adoption</th>
                  <th className="px-2 py-1 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {res.results.map((r) => (
                  <tr key={r.row} className={cn("border-t", !r.ok && "bg-red-50")}>
                    <td className="px-2 py-1">{r.row}</td>
                    <td className="px-2 py-1">{String(r.data.initiative ?? "")}</td>
                    <td className="px-2 py-1">{String(r.data.month ?? "")}</td>
                    <td className="px-2 py-1 text-right">{String(r.data.volume ?? "")}</td>
                    <td className="px-2 py-1 text-right">{String(r.data.adoptionRate ?? "")}</td>
                    <td className="px-2 py-1">{r.ok ? "✓ valid" : r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button size="sm" onClick={commit} disabled={pending || res.valid === 0}>
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Import {res.valid} valid rows
          </Button>
        </div>
      )}
      {msg && <p className={cn("text-xs", msg.ok ? "text-[#006300]" : "text-red-700")}>{msg.text}</p>}
    </div>
  );
}
