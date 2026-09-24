import ExcelJS from "exceljs";
import type { ReportModel } from "./builders";

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV: every section flattened; KPI sections become label/value rows. */
export function toCsv(r: ReportModel): string {
  const lines: string[] = [esc(r.title), esc(r.subtitle), `Generated,${esc(r.generatedAt)},By,${esc(r.generatedBy)},Scope,${esc(r.scope)}`, ""];
  for (const s of r.sections) {
    lines.push(esc(s.title));
    if (s.kind === "table") {
      lines.push(s.columns.map(esc).join(","));
      for (const row of s.rows) lines.push(row.map(esc).join(","));
    } else if (s.kind === "kpis") {
      lines.push("Metric,Value,Note");
      for (const k of s.items) lines.push([k.label, k.value, k.note ?? ""].map(esc).join(","));
    } else if (s.kind === "waterfall") {
      lines.push("Step,Value,Type");
      for (const st of s.steps) lines.push([st.label, Math.round(st.value), st.kind].map(esc).join(","));
    } else if (s.kind === "text") {
      for (const p of s.paragraphs) lines.push(esc(p));
    } else {
      for (const i of s.items) lines.push(esc(i));
    }
    lines.push("");
  }
  lines.push("Notes");
  for (const d of r.disclaimer) lines.push(esc(d));
  return "﻿" + lines.join("\r\n");
}

/** Excel: a Summary sheet plus one sheet per tabular section, with consulting-style formatting. */
export async function toXlsx(r: ReportModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AI Value Realization Platform";
  wb.created = new Date();
  const header = (ws: ExcelJS.Worksheet, row: number) => {
    const rr = ws.getRow(row);
    rr.font = { bold: true, color: { argb: "FFFFFFFF" } };
    rr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A8A" } };
  };
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 42 }, { width: 28 }, { width: 40 }];
  sum.addRow([r.title]).font = { bold: true, size: 14 };
  sum.addRow([r.subtitle]);
  sum.addRow([`Generated ${r.generatedAt} by ${r.generatedBy} · Scope: ${r.scope}`]).font = { italic: true, color: { argb: "FF666666" } };
  sum.addRow([]);
  for (const s of r.sections) {
    if (s.kind === "kpis") {
      sum.addRow([s.title]).font = { bold: true };
      sum.addRow(["Metric", "Value", "Note"]);
      header(sum, sum.rowCount);
      for (const k of s.items) sum.addRow([k.label, k.value, k.note ?? ""]);
      sum.addRow([]);
    } else if (s.kind === "text" || s.kind === "bullets") {
      sum.addRow([s.title]).font = { bold: true };
      for (const t of s.kind === "text" ? s.paragraphs : s.items) {
        const row = sum.addRow([t]);
        sum.mergeCells(row.number, 1, row.number, 3);
        row.alignment = { wrapText: true, vertical: "top" };
        row.height = Math.min(90, 15 * Math.ceil(t.length / 110));
      }
      sum.addRow([]);
    }
  }
  sum.addRow(["Notes"]).font = { bold: true };
  for (const d of r.disclaimer) sum.addRow([d]);

  let n = 1;
  for (const s of r.sections) {
    if (s.kind !== "table" && s.kind !== "waterfall") continue;
    const ws = wb.addWorksheet(`${n++}. ${s.title}`.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"));
    const cols = s.kind === "table" ? s.columns : ["Step", "Value", "Type"];
    const rows = s.kind === "table" ? s.rows : s.steps.map((x) => [x.label, Math.round(x.value), x.kind]);
    ws.addRow(cols);
    header(ws, 1);
    for (const row of rows) ws.addRow(row);
    ws.columns.forEach((c, i) => {
      c.width = Math.min(60, Math.max(12, ...[cols[i], ...rows.map((x) => x[i])].map((v) => String(v ?? "").length + 2)));
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (s.kind === "waterfall") ws.getColumn(2).numFmt = "#,##0";
    if ("note" in s && s.note) ws.addRow([]).getCell(1);
    if ("note" in s && s.note) ws.addRow([s.note]).font = { italic: true };
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
