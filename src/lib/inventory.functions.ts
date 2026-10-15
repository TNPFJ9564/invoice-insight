import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
});
const invoiceSchema = z.object({
  invoice_no: z.string(), company_name: z.string(), tax_id: z.string(), invoice_date: z.string(),
  salesperson: z.string(), grand_total: z.coerce.number(), image_url: z.string().default(""),
  raw_text: z.string().default(""), items: z.array(itemSchema),
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
    const items = s.matchItems(ocr.items ?? [], refs.ttmt, refs.po, { tax_id: ocr.tax_id, company_name: ocr.company_name });
    return {
      draft: { ...ocr, image_url: drive.url, items } as InvoiceDraft,
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
        i.gpu_code, i.tpu_code, i.product_name, i.quantity, i.unit, i.unit_price, i.total_price, inv.grand_total, inv.image_url, i.common_name, i.status]));
    } catch (e) { sheetError = String((e as Error).message); }
    const line = data.notify ? await s.sendLine({ ...inv, items: inv.items as any }) : { sent: false, reason: "ปิดการแจ้งเตือน" };
    return { id: row.id as string, sheetError, line };
  });

export const listInvoices = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).from("invoices")
    .select("*, invoice_items(*)").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return data as any[];
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
    line: !!process.env["LINE_CHANNEL_ACCESS_TOKEN"] && !!process.env["LINE_TARGET_ID"],
    drive: !!process.env["GOOGLE_DRIVE_API_KEY"], sheetId: s.SHEET_ID, folderId: s.DRIVE_FOLDER_ID,
  };
});

export const testLine = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireAdmin(context as any);
  const s = await import("./inventory.server");
  return s.sendLine({ invoice_no: "TEST-001", company_name: "ทดสอบระบบ", invoice_date: "-", salesperson: "-", grand_total: 0,
    items: [{ product_name: "ทดสอบ", common_name: "test", gpu_code: "", tpu_code: "", unit: "กล่อง", quantity: 1, unit_price: 0, total_price: 0, status: "ตรงกัน", match_score: 100 }] });
});

export const dashboardKpi = createServerFn({ method: "GET" }).handler(async () => {
  const s = await import("./inventory.server");
  const [refs, inv] = await Promise.all([s.loadReferenceSheets(), s.loadInvSheet()]);
  return s.computeKpi(refs.po, inv);
});
