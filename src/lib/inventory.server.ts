// Server-only helpers: Google Sheets / Drive (via Lovable connector gateway), Lovable AI OCR, LINE.
export const SHEET_ID = "1frg6i2D6aK9neM4PSEO9yhR4YvlcG3o3msBooMI7lKk";
export const DRIVE_FOLDER_ID = "1uQQUoMAjMpb7wo3Gy-yAHtQRZs3WYFRL";
const GW = "https://connector-gateway.lovable.dev";

function gwHeaders(connKeyEnv: string) {
  const lk = process.env["LOVABLE_API_KEY"];
  const ck = process.env[connKeyEnv];
  if (!lk || !ck) throw new Error(`Missing LOVABLE_API_KEY or ${connKeyEnv}`);
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck };
}

async function ok(res: Response, label: string) {
  if (!res.ok) {
    const t = await res.text();
    console.error(`${label} failed [${res.status}]: ${t}`);
    throw new Error(`${label} failed [${res.status}]: ${t.slice(0, 300)}`);
  }
  return res;
}

// ---------- Sheets ----------
let refCache: { at: number; ttmt: string[][]; po: string[][] } | null = null;

export async function loadReferenceSheets(force = false) {
  if (!force && refCache && Date.now() - refCache.at < 5 * 60_000) return refCache;
  const url = `${GW}/google_sheets/v4/spreadsheets/${SHEET_ID}/values:batchGet?ranges=TTMT!A1:Z5000&ranges=PO!A1:Z5000`;
  const res = await ok(await fetch(url, { headers: gwHeaders("GOOGLE_SHEETS_API_KEY") }), "Read sheets");
  const j = (await res.json()) as { valueRanges: { values?: string[][] }[] };
  refCache = { at: Date.now(), ttmt: j.valueRanges[0]?.values ?? [], po: j.valueRanges[1]?.values ?? [] };
  return refCache;
}

export async function appendInvRows(rows: (string | number)[][]) {
  const url = `${GW}/google_sheets/v4/spreadsheets/${SHEET_ID}/values/INV!A:P:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await ok(
    await fetch(url, {
      method: "POST",
      headers: { ...gwHeaders("GOOGLE_SHEETS_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ values: rows }),
    }),
    "Append INV",
  );
}

// ---------- Drive ----------
export async function uploadToDrive(base64: string, mime: string, name: string) {
  const headers = gwHeaders("GOOGLE_DRIVE_API_KEY");
  const tryUpload = async (parents?: string[]) => {
    const boundary = "b" + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name, mimeType: mime, ...(parents ? { parents } : {}) });
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;
    return fetch(`${GW}/google_drive/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true`, {
      method: "POST",
      headers: { ...headers, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
  };
  let res = await tryUpload([DRIVE_FOLDER_ID]);
  if (!res.ok) {
    console.warn("Drive folder upload failed, retrying in root", res.status, await res.text());
    res = await tryUpload();
  }
  await ok(res, "Drive upload");
  const f = (await res.json()) as { id: string; webViewLink?: string };
  // make viewable so the app can show the bill image
  await fetch(`${GW}/google_drive/drive/v3/files/${f.id}/permissions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  }).catch(() => null);
  return { id: f.id, url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view` };
}

// ---------- OCR (Lovable AI) ----------
export type OcrItem = { product_name: string; gpu_code?: string; tpu_code?: string; quantity: number; unit_price: number; total_price: number };
export type OcrResult = {
  company_name: string; tax_id: string; invoice_no: string; invoice_date: string; salesperson: string;
  grand_total: number; raw_text: string; items: OcrItem[];
};

export async function runOcr(base64: string, mime: string): Promise<OcrResult> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const S = { type: "string" }, N = { type: "number" };
  const schema = {
    type: "object", additionalProperties: false,
    properties: {
      company_name: S, tax_id: S, invoice_no: S, invoice_date: S, salesperson: S, grand_total: N, raw_text: S,
      items: { type: "array", items: { type: "object", additionalProperties: false,
        properties: { product_name: S, gpu_code: S, tpu_code: S, quantity: N, unit_price: N, total_price: N },
        required: ["product_name", "gpu_code", "tpu_code", "quantity", "unit_price", "total_price"] } },
    },
    required: ["company_name", "tax_id", "invoice_no", "invoice_date", "salesperson", "grand_total", "raw_text", "items"],
  };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions: "You are an OCR engine for Thai pharmaceutical invoices. Extract data exactly as printed. Numbers as plain numbers (no commas). Tax ID 13 digits only. Dates as printed. Use empty string when missing. GPU/TPU codes only if printed on the bill. raw_text = full OCR text.",
      input: [{ role: "user", content: [
        { type: "input_text", text: "Extract the invoice data as JSON." },
        { type: "input_image", image_url: `data:${mime};base64,${base64}` },
      ] }],
      text: { format: { type: "json_schema", name: "invoice", strict: true, schema } },
    }),
  });
  if (res.status === 429) throw new Error("ระบบ AI ถูกใช้งานหนาแน่น กรุณาลองใหม่อีกครั้ง");
  if (res.status === 402) throw new Error("เครดิต AI หมด กรุณาเติมเครดิตใน Workspace");
  await ok(res, "OCR");
  // consume SSE stream
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "", final = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.startsWith("data:")) continue;
      const d = l.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta") out += ev.delta;
        else if (ev.type === "response.output_text.done") final = ev.text;
        else if (ev.type === "response.failed" || ev.type === "error") throw new Error(JSON.stringify(ev).slice(0, 300));
      } catch (e) { if (e instanceof Error && e.message.startsWith("{")) throw e; }
    }
  }
  const text = final || out;
  if (!text) throw new Error("OCR ไม่สามารถอ่านเอกสารได้");
  return JSON.parse(text) as OcrResult;
}

// ---------- Matching ----------
const norm = (s: string) => (s ?? "").toString().toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");
function sim(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const grams = (s: string) => new Set(Array.from({ length: Math.max(1, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const A = grams(x), B = grams(y);
  let n = 0; A.forEach((g) => B.has(g) && n++);
  return (2 * n) / (A.size + B.size);
}
const findCol = (h: string[], re: RegExp) => h.findIndex((c) => re.test(c ?? ""));

export type MatchedItem = OcrItem & {
  common_name: string; match_score: number;
  po_product?: string | undefined; po_qty?: number | undefined; po_price?: number | undefined; status: string;
};

export function matchItems(items: OcrItem[], ttmt: string[][], po: string[][]): MatchedItem[] {
  const th = ttmt[0] ?? [];
  const tTrade = findCol(th, /การค้า|trade|brand/i);
  const tCommon = findCol(th, /สามัญ|generic|common/i);
  const tGpu = findCol(th, /gpu/i), tTpu = findCol(th, /tpu/i);
  const ph = po[0] ?? [];
  const pName = findCol(ph, /ชื่อ|product|รายการ|item|การค้า/i);
  const pQty = findCol(ph, /จำนวน|qty|quantity/i);
  const pPrice = findCol(ph, /ราคา.*หน่วย|unit|ราคา|price/i);
  const num = (v: unknown) => Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;

  return items.map((it) => {
    let best: string[] | null = null, bs = 0;
    for (const r of ttmt.slice(1)) {
      const s = Math.max(sim(it.product_name, r[tTrade] ?? ""), it.tpu_code && r[tTpu] === it.tpu_code ? 1 : 0);
      if (s > bs) { bs = s; best = r; }
    }
    const t = bs >= 0.5 ? best : null;
    let pBest: string[] | null = null, pbs = 0;
    for (const r of po.slice(1)) {
      const s = Math.max(sim(it.product_name, r[pName] ?? ""), t && tCommon >= 0 ? sim(t[tCommon] ?? "", r[pName] ?? "") : 0);
      if (s > pbs) { pbs = s; pBest = r; }
    }
    const p = pbs >= 0.5 ? pBest : null;
    const poQty = p && pQty >= 0 ? num(p[pQty]) : undefined;
    const poPrice = p && pPrice >= 0 ? num(p[pPrice]) : undefined;
    const issues: string[] = [];
    if (!t) issues.push("ไม่พบใน TTMT");
    if (!p) issues.push("ไม่พบใน PO");
    else {
      if (poQty !== undefined && poQty !== it.quantity) issues.push("จำนวนไม่ตรง PO");
      if (poPrice !== undefined && Math.abs(poPrice - it.unit_price) > 0.01) issues.push("ราคาไม่ตรง PO");
    }
    return {
      ...it,
      gpu_code: it.gpu_code || (t && tGpu >= 0 ? t[tGpu] : "") || "",
      tpu_code: it.tpu_code || (t && tTpu >= 0 ? t[tTpu] : "") || "",
      common_name: t && tCommon >= 0 ? t[tCommon] ?? "" : "",
      match_score: Math.round(bs * 100),
      po_product: p ? p[pName] : undefined, po_qty: poQty, po_price: poPrice,
      status: issues.length ? issues.join(", ") : "ตรงกัน",
    };
  });
}

// ---------- LINE ----------
const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function sendLine(inv: { invoice_no: string; company_name: string; invoice_date: string; salesperson: string; grand_total: number; image_url?: string; items: MatchedItem[] }) {
  const token = process.env["LINE_CHANNEL_ACCESS_TOKEN"];
  const to = process.env["LINE_TARGET_ID"];
  if (!token || !to) return { sent: false, reason: "ยังไม่ได้ตั้งค่า LINE" };
  const row = (l: string, v: string) => ({ type: "box", layout: "horizontal", contents: [
    { type: "text", text: l, size: "xs", color: "#888888", flex: 2 },
    { type: "text", text: v || "-", size: "xs", color: "#000000", flex: 4, wrap: true, align: "end" }] });
  const summary = {
    type: "bubble",
    header: { type: "box", layout: "vertical", backgroundColor: "#000000", contents: [
      { type: "text", text: "SOBPRAB DUUGS · บันทึกสำเร็จ", color: "#FFFFFF", size: "xxs", weight: "bold" },
      { type: "text", text: inv.invoice_no || "-", color: "#FFFFFF", size: "xl", weight: "bold" }] },
    body: { type: "box", layout: "vertical", spacing: "sm", contents: [
      row("บริษัท", inv.company_name), row("วันที่", inv.invoice_date), row("พนักงานขาย", inv.salesperson),
      row("จำนวนรายการ", String(inv.items.length)), { type: "separator", margin: "md" },
      { type: "box", layout: "horizontal", margin: "md", contents: [
        { type: "text", text: "รวมสุทธิ", weight: "bold", size: "sm" },
        { type: "text", text: `฿${fmt(inv.grand_total)}`, weight: "bold", size: "lg", align: "end" }] }] },
    ...(inv.image_url ? { footer: { type: "box", layout: "vertical", contents: [
      { type: "button", style: "primary", color: "#000000", height: "sm", action: { type: "uri", label: "ดูรูปบิล", uri: inv.image_url } }] } } : {}),
  };
  const itemBubbles = [];
  for (let i = 0; i < inv.items.length && itemBubbles.length < 11; i += 5) {
    itemBubbles.push({ type: "bubble", size: "kilo", body: { type: "box", layout: "vertical", spacing: "md", contents: [
      { type: "text", text: `รายการ ${i + 1}–${Math.min(i + 5, inv.items.length)}`, size: "xxs", color: "#888888", weight: "bold" },
      ...inv.items.slice(i, i + 5).map((it) => ({ type: "box", layout: "vertical", contents: [
        { type: "text", text: it.product_name, size: "sm", weight: "bold", wrap: true },
        { type: "text", text: `${it.common_name || "-"} · ${it.quantity} × ${fmt(it.unit_price)} = ${fmt(it.total_price)}`, size: "xxs", color: "#555555", wrap: true },
        { type: "text", text: it.status, size: "xxs", color: it.status === "ตรงกัน" ? "#000000" : "#D10000" }] })),
    ] } });
  }
  const contents = itemBubbles.length ? { type: "carousel", contents: [summary, ...itemBubbles] } : summary;
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, messages: [{ type: "flex", altText: `บันทึกบิล ${inv.invoice_no} ฿${fmt(inv.grand_total)}`, contents }] }),
  });
  if (!res.ok) { const t = await res.text(); console.error("LINE", res.status, t); return { sent: false, reason: `LINE ${res.status}: ${t.slice(0, 200)}` }; }
  return { sent: true };
}
