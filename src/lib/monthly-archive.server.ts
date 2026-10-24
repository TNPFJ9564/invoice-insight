import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadReferenceSheets, loadInvSheet } from "./inventory.server";
import { groupSheetMonths, mergeArchiveRows } from "./monthly-data";

export async function archiveSheet(source: "PO" | "INV", sheet: string[][]) {
  const { headers, groups } = groupSheetMonths(source, sheet);
  for (const [month, incoming] of groups) {
    const { data: old, error: readError } = await supabaseAdmin.from("sheet_month_archives").select("rows,headers").eq("source", source).eq("month", month).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (old && JSON.stringify(old.headers) !== JSON.stringify(headers)) throw new Error(`หัวตาราง ${source} เปลี่ยน กรุณาตรวจสอบก่อนซิงค์`);
    const rows = mergeArchiveRows((old?.rows ?? []) as string[][], incoming);
    const { error } = await supabaseAdmin.from("sheet_month_archives").upsert({ source, month, headers, rows, captured_at: new Date().toISOString() }, { onConflict: "source,month" });
    if (error) throw new Error(error.message);
  }
}

export async function syncMonthlySheets(force = false) {
  const { data: latest, error } = await supabaseAdmin.from("sheet_month_archives").select("captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!force && latest && Date.now() - new Date(latest.captured_at).getTime() < 86400000) return;
  const [refs, inv] = await Promise.all([loadReferenceSheets(true), loadInvSheet()]);
  await archiveSheet("PO", refs.po);
  await archiveSheet("INV", inv);
}

export async function readMonthlySheet(source: "PO" | "INV", month: string): Promise<string[][]> {
  const { data, error } = await supabaseAdmin.from("sheet_month_archives").select("headers,rows").eq("source", source).eq("month", month).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? [data.headers as string[], ...(data.rows as string[][])] : [];
}