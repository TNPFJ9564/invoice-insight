import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MONTH_PATTERN, bangkokMonth, monthBounds, timestampMonth } from "./monthly-data";

const requireAdmin = async (context: { supabase: any; userId: string }) => {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("เฉพาะผู้ดูแลระบบเท่านั้น");
};

export const checkAdmin = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any).rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { isAdmin: !!data };
  });

const itemSchema = z.object({
  product_name: z.string(), common_name: z.string().default(""),
  gpu_code: z.string().default(""), tpu_code: z.string().default(""), unit: z.string().default(""),
  quantity: z.coerce.number(), unit_price: z.coerce.number(), total_price: z.coerce.number(),
  status: z.string().default(""), match_score: z.number().optional(),
  po_product: z.string().optional(), po_qty: z.number().optional(), po_price: z.number().optional(),
  po_no: z.string().optional(), generic_confirmed: z.boolean().optional(),
  vat_inclusive_unit_price: z.number().nullable().optional(), vat_inclusive_total_price: z.number().nullable().optional(),
  candidates: z.array(z.object({ common_name: z.string(), gpu_code: z.string(), tpu_code: z.string(), score: z.number(), source: z.string() })).optional(),
});
const invoiceSchema = z.object({
  invoice_no: z.string(), company_name: z.string(), tax_id: z.string(), invoice_date: z.string(),
  salesperson: z.string(), grand_total: z.coerce.number(), image_url: z.string().default(""),
  raw_text: z.string().default(""), items: z.array(itemSchema),
  po_no: z.string().default(""),
  price_analysis: z.object({ mode: z.enum(["inclusive", "converted", "review"]), note: z.string(), difference: z.number() }).optional(),
});
export type InvoiceDraft = z.infer<typeof invoiceSchema>;

export const processInvoice = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ base64: z.string().max(15_000_000), mime: z.string(), name: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./inventory.server");
    const [drive, ocr, refs] = await Promise.all([
      s.uploadToDrive(data.base64, data.mime, `${Date.now()}_${data.name}`).catch((e) => ({ id: "", url: "", error: String(e.message ?? e) })),
      s.runOcr(data.base64, data.mime),
      s.loadReferenceSheets().catch((e) => { console.error(e); return { ttmt: [] as string[][], po: [] as string[][] }; }),
    ]);
    const { analyzeInvoicePrices } = await import("./invoice-pricing");
    const pricing = analyzeInvoicePrices(ocr.items ?? [], ocr.grand_total, ocr.vat_amount);
    const items = s.matchItems(pricing.items, refs.ttmt, refs.po, { tax_id: ocr.tax_id, company_name: ocr.company_name });
    return {
      draft: { ...ocr, po_no: ocr.po_no || [...new Set(items.map((it) => it.po_no).filter(Boolean))].join(", "), image_url: drive.url, items, price_analysis: pricing.analysis } as InvoiceDraft,
      driveError: "error" in drive ? drive.error : null,
      refCounts: { ttmt: Math.max(0, refs.ttmt.length - 1), po: Math.max(0, refs.po.length - 1) },
    };
  });

export const rematchItems = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ items: z.array(itemSchema), tax_id: z.string().default(""), company_name: z.string().default("") }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./inventory.server");
    const refs = await s.loadReferenceSheets(true);
    return s.matchItems(data.items, refs.ttmt, refs.po, { tax_id: data.tax_id, company_name: data.company_name });
  });

export const saveInvoice = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ invoice: invoiceSchema, notify: z.boolean().default(true) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const s = await import("./inventory.server");
    const inv = data.invoice;
    const status = inv.items.every((i) => i.status === "ตรงกัน") ? "ตรงกัน" : "ต้องตรวจสอบ";
    const db = supabaseAdmin as any;
    const { data: row, error } = await db.from("invoices").insert({
      invoice_no: inv.invoice_no, company_name: inv.company_name, tax_id: inv.tax_id, invoice_date: inv.invoice_date,
      salesperson: inv.salesperson, grand_total: inv.grand_total, image_url: inv.image_url, status, raw_text: inv.raw_text,
    }).select("id").single();
    if (error) throw new Error(`บันทึกฐานข้อมูลไม่สำเร็จ: ${error.message}`);
    if (inv.items.length) {
      const { error: e2 } = await db.from("invoice_items").insert(inv.items.map((i) => ({
        invoice_id: row.id, product_name: i.product_name, common_name: i.common_name, gpu_code: i.gpu_code, tpu_code: i.tpu_code,
        quantity: i.quantity, unit: i.unit, unit_price: i.unit_price, total_price: i.total_price, status: i.status,
      })));
      if (e2) throw new Error(`บันทึกรายการไม่สำเร็จ: ${e2.message}`);
    }
    const ts = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    let sheetError: string | null = null;
    try {
      await s.appendInvRows(inv.items.map((i) => [ts, inv.invoice_no, inv.company_name, `'${inv.tax_id}`, inv.invoice_date, inv.salesperson,
        i.gpu_code, i.tpu_code, i.product_name, i.quantity, i.unit, i.unit_price, i.total_price, inv.grand_total, inv.image_url, i.common_name, i.status, i.po_no || inv.po_no || ""]));
    } catch (e) { sheetError = String((e as Error).message); }
    try { const a = await import("./monthly-archive.server"); await a.syncMonthlySheets(); } catch (e) { console.warn("monthly archive sync failed", e); }
    const line = data.notify ? await s.sendLine({ ...inv, timestamp: ts, items: inv.items as any }) : { sent: false, reason: "ปิดการแจ้งเตือน" };
    return { id: row.id as string, sheetError, line };
  });

const monthInput = (d: unknown) => z.object({ month: z.string().regex(MONTH_PATTERN) }).parse(d);

export const listInvoices = createServerFn({ method: "GET" }).inputValidator(monthInput).handler(async ({ data: input }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { start, end } = monthBounds(input.month);
  const { data, error } = await (supabaseAdmin as any).from("invoices")
    .select("*, invoice_items(*)").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  const saved = (data as any[]).map((d) => ({ ...d, source: "app" }));
  let sheetRows: unknown[][] = [];
  try {
    if (input.month === bangkokMonth()) { const s = await import("./inventory.server"); sheetRows = await s.loadInvSheet(); }
    else { const a = await import("./monthly-archive.server"); sheetRows = await a.readMonthlySheet("INV", input.month); }
  } catch (e) { console.warn("INV sheet read failed", e); }
  const { invoicesFromSheet } = await import("./sheet-invoices");
  return [...saved, ...invoicesFromSheet(sheetRows, input.month, saved)]
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at))) as any[];
});

export const listDriveImages = createServerFn({ method: "GET" }).inputValidator(monthInput).handler(async ({ data: input }) => {
  const s = await import("./inventory.server");
  const { start, end } = monthBounds(input.month);
  try { return await s.listDriveFolder(start, end); } catch (e) { console.warn("Drive list failed", e); return []; }
});

export const deleteInvoice = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("invoices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const systemStatus = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireAdmin(context as any);
  const s = await import("./inventory.server");
  let sheets = "ok", counts = { ttmt: 0, po: 0 };
  try { const r = await s.loadReferenceSheets(true); counts = { ttmt: r.ttmt.length - 1, po: r.po.length - 1 }; }
  catch (e) { sheets = String((e as Error).message).slice(0, 200); }
  return {
    sheets, counts,
    line: !!process.env["LINE_CHANNEL_ACCESS_TOKEN"],
    drive: !!process.env["GOOGLE_DRIVE_API_KEY"], sheetId: s.SHEET_ID, folderId: s.DRIVE_FOLDER_ID,
  };
});

export const testLine = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireAdmin(context as any);
  const s = await import("./inventory.server");
  return s.sendLine({ invoice_no: "TEST-001", company_name: "ทดสอบระบบ", invoice_date: "-", salesperson: "-", grand_total: 0,
    items: [{ product_name: "ทดสอบ", common_name: "test", gpu_code: "", tpu_code: "", unit: "กล่อง", quantity: 1, unit_price: 0, total_price: 0, status: "ตรงกัน", match_score: 100 }] });
});

export const dashboardKpi = createServerFn({ method: "GET" }).inputValidator(monthInput).handler(async ({ data: input }) => {
  const s = await import("./inventory.server");
  const a = await import("./monthly-archive.server");
  if (input.month === bangkokMonth()) {
    const [refs, inv] = await Promise.all([s.loadReferenceSheets(true), s.loadInvSheet()]);
    let archiveError: string | null = null;
    try { await a.archiveSheet("PO", refs.po); await a.archiveSheet("INV", inv); } catch (e) { archiveError = (e as Error).message; }
    const invMonth = [inv[0] ?? [], ...inv.slice(1).filter((r) => timestampMonth(r[0]) === input.month)];
    return { ...s.computeKpi(refs.po, invMonth), source: "live" as const, archiveError };
  }
  const [po, inv] = await Promise.all([a.readMonthlySheet("PO", input.month), a.readMonthlySheet("INV", input.month)]);
  return { ...s.computeKpi(po, inv.length ? inv : [[]]), source: (po.length ? "archive" : "empty") as "archive" | "empty", archiveError: null };
});
