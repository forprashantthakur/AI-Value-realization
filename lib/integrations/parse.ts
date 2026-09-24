import ExcelJS from "exceljs";
import Papa from "papaparse";

/** Parse CSV or XLSX (first sheet) into header-keyed rows. */
export async function parseTabular(name: string, buf: Buffer): Promise<Record<string, unknown>[]> {
  if (name.toLowerCase().endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell((c, i) => (headers[i] = String(c.value ?? "").trim()));
    const rows: Record<string, unknown>[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const o: Record<string, unknown> = {};
      row.eachCell((c, i) => {
        const v = c.value as unknown;
        o[headers[i]] = v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v;
      });
      if (Object.keys(o).length) rows.push(o);
    });
    return rows;
  }
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const res = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  return res.data;
}
