import { timestampMonth } from "./monthly-data";

/** Convert an INV Timestamp (Thai text, ISO, or Sheets serial in Bangkok wall time) to ISO. */
export function timestampIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000 - 7 * 3600000).toISOString();
  }
  const text = String(value ?? "").trim().replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50));
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const y = Number(m[3]) > 2400 ? Number(m[3]) - 543 : Number(m[3]);
    return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0) - 7, Number(m[5] ?? 0), Number(m[6] ?? 0))).toISOString();
  }
  const d = new Date(text);
  return /^\d{4}-\d{2}-\d{2}/.test(text) && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/\s+/g, "");
export const invoiceKey = (inv: { invoice_no?: unknown; company_name?: unknown }) => `${norm(inv.invoice_no)}|${norm(inv.company_name)}`;
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };

/**
 * Group INV sheet rows (A Timestamp … R PO No) of one month into invoices,
 * skipping invoices already saved by the app (same bill number + company).
 */
export function invoicesFromSheet(sheet: unknown[][], month: string, existing: { invoice_no?: unknown; company_name?: unknown }[]) {
  const known = new Set(existing.map(invoiceKey));
  const groups = new Map<string, any>();
  for (const r of sheet.slice(1)) {
    if (!r?.some((v) => String(v ?? "").trim())) continue;
    if (timestampMonth(r[0]) !== month) continue;
    const head = { invoice_no: String(r[1] ?? ""), company_name: String(r[2] ?? "") };
    if (!head.invoice_no && !String(r[8] ?? "").trim()) continue;
    const key = invoiceKey(head);
    if (known.has(key)) continue;
    let inv = groups.get(key);
    if (!inv) {
      inv = {
        id: `sheet:${key}`, source: "sheet", ...head, tax_id: String(r[3] ?? "").replace(/^'/, ""), invoice_date: String(r[4] ?? ""),
        salesperson: String(r[5] ?? ""), grand_total: num(r[13]), image_url: String(r[14] ?? ""),
        created_at: timestampIso(r[0]) ?? new Date().toISOString(), status: "ตรงกัน", invoice_items: [] as any[],
      };
      groups.set(key, inv);
    }
    const status = String(r[16] ?? "");
    if (status && status !== "ตรงกัน") inv.status = "ต้องตรวจสอบ";
    inv.invoice_items.push({
      id: `${inv.id}:${inv.invoice_items.length}`, gpu_code: String(r[6] ?? ""), tpu_code: String(r[7] ?? ""), product_name: String(r[8] ?? ""),
      quantity: num(r[9]), unit: String(r[10] ?? ""), unit_price: num(r[11]), total_price: num(r[12]),
      common_name: String(r[15] ?? ""), status, po_no: String(r[17] ?? ""),
    });
  }
  return [...groups.values()];
}
