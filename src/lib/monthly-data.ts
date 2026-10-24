export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function bangkokMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}

export function monthBounds(month: string) {
  if (!MONTH_PATTERN.test(month)) throw new Error("เดือนต้องเป็น YYYY-MM");
  const [year, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(year ?? 0, (m ?? 1) - 1, 1, -7)).toISOString(), end: new Date(Date.UTC(year ?? 0, m ?? 1, 1, -7)).toISOString() };
}

/** Sheets serials are local wall time; Thai-formatted timestamps use Buddhist years. */
export function timestampMonth(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return date.toISOString().slice(0, 7);
  }
  const text = String(value ?? "").trim().replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50));
  const thai = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (thai) {
    const year = Number(thai[3]);
    const month = Number(thai[2]);
    if (month < 1 || month > 12 || Number(thai[1]) < 1 || Number(thai[1]) > 31) return null;
    return `${year > 2400 ? year - 543 : year}-${String(month).padStart(2, "0")}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : bangkokMonth(date);
}

export function groupSheetMonths(source: "PO" | "INV", sheet: string[][], capturedAt = new Date()) {
  const headers = sheet[0] ?? [];
  const timestampCol = headers.findIndex((h) => /^\s*(timestamp|ประทับเวลา|เวลาบันทึก)\s*$/i.test(String(h)));
  const groups = new Map<string, string[][]>();
  for (const row of sheet.slice(1)) {
    if (!row.some((v) => String(v ?? "").trim())) continue;
    const month = timestampMonth(row[timestampCol >= 0 ? timestampCol : source === "INV" ? 0 : -1])
      ?? (source === "PO" && timestampCol < 0 ? bangkokMonth(capturedAt) : null);
    if (!month) continue;
    const rows = groups.get(month) ?? [];
    rows.push(row);
    groups.set(month, rows);
  }
  return { headers, groups };
}

/** Merge without duplicating repeated reads; do not discard rows after sheet replacement. */
export function mergeArchiveRows(previous: string[][], incoming: string[][]) {
  const counts = new Map<string, number>();
  for (const row of previous) { const key = JSON.stringify(row); counts.set(key, (counts.get(key) ?? 0) + 1); }
  const seen = new Map<string, number>();
  const merged = [...previous];
  for (const row of incoming) {
    const key = JSON.stringify(row), occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    if (occurrence > (counts.get(key) ?? 0)) merged.push(row);
  }
  return merged;
}