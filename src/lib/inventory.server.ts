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
  const url = `${GW}/google_sheets/v4/spreadsheets/${SHEET_ID}/values/INV!A:Q:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await ok(
    await fetch(url, {
      method: "POST",
      headers: { ...gwHeaders("GOOGLE_SHEETS_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ values: rows }),
    }),
    "Append INV",
  );
}

export async function loadInvSheet() {
  const url = `${GW}/google_sheets/v4/spreadsheets/${SHEET_ID}/values/INV!A1:Q5000`;
  const res = await ok(await fetch(url, { headers: gwHeaders("GOOGLE_SHEETS_API_KEY") }), "Read INV");
  const j = (await res.json()) as { values?: string[][] };
  return j.values ?? [];
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
export type OcrItem = { product_name: string; common_name?: string; gpu_code?: string; tpu_code?: string; unit?: string; quantity: number; unit_price: number; total_price: number };
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
        properties: { product_name: S, common_name: S, gpu_code: S, tpu_code: S, quantity: N, unit: S, unit_price: N, total_price: N },
        required: ["product_name", "common_name", "gpu_code", "tpu_code", "quantity", "unit", "unit_price", "total_price"] } },
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
      instructions: "You are an OCR engine for Thai pharmaceutical invoices. Extract data exactly as printed. Numbers as plain numbers (no commas). Tax ID 13 digits only. Dates as printed. Use empty string when missing. product_name = trade name as printed. common_name = generic name only if printed on the bill (often after the trade name or in parentheses), else empty. unit = counting unit of the quantity as printed (e.g. กล่อง, ขวด, แผง, เม็ด, box, vial). GPU/TPU codes only if printed on the bill. raw_text = full OCR text.",
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

const num = (v: unknown) => Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;
const code = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/**
 * Matching rules:
 * 1. If the bill already gives common name + GPU + TPU, skip the TTMT lookup.
 * 2. Otherwise look up TTMT: exact TPU/GPU first, else trade name (+ manufacturer vs company name).
 * 3. Check against PO: exact GPU/TPU first, else Tax ID + quantity + unit price, else drug name within same Tax ID.
 */
export function matchItems(items: OcrItem[], ttmt: string[][], po: string[][], bill: { tax_id: string; company_name: string }): MatchedItem[] {
  const th = ttmt[0] ?? [];
  const tGpu = findCol(th, /^\s*gpu/i), tTpu = findCol(th, /^\s*tpu/i);
  const tActive = findCol(th, /activeingredient|สามัญ|generic/i), tStrength = findCol(th, /strength|ความแรง/i);
  const tForm = findCol(th, /dispunit|รูปแบบ|form/i), tTrade = findCol(th, /tradename|การค้า|trade/i);
  const tMfr = findCol(th, /manufacturer|ผู้ผลิต/i);
  const ph = po[0] ?? [];
  const pTax = findCol(ph, /tax/i), pName = findCol(ph, /drugs?\s*name|ชื่อยา/i);
  const pQty = findCol(ph, /^\s*(qual|quan|qty|จำนวน)/i), pPrice = findCol(ph, /price\s*\/\s*unit|ราคา.*หน่วย/i);
  const pGpu = findCol(ph, /gpu/i), pTpu = findCol(ph, /tpu/i);
  const billTax = code(bill.tax_id);
  const poRows = po.slice(1).filter((r) => r[pName]);
  const commonOf = (r: string[]) => [r[tActive], r[tStrength], r[tForm]].filter(Boolean).join(" ");

  return items.map((it) => {
    let gpu = code(it.gpu_code), tpu = code(it.tpu_code), common = (it.common_name ?? "").trim();
    let score = 100;
    const complete = !!(common && gpu && tpu);
    let fromTtmt = complete;

    if (!complete) {
      let row: string[] | undefined;
      if (tpu) row = ttmt.find((r) => code(r[tTpu]) === tpu);
      if (!row && gpu) row = ttmt.find((r) => code(r[tGpu]) === gpu);
      if (!row) {
        let bs = 0;
        for (const r of ttmt.slice(1)) {
          const s = sim(it.product_name, r[tTrade] ?? "") + 0.15 * sim(bill.company_name, r[tMfr] ?? "");
          if (s > bs) { bs = s; row = r; }
        }
        score = Math.round(Math.min(1, bs) * 100);
        if (bs < 0.55) row = undefined;
      }
      if (row) {
        fromTtmt = true;
        gpu ||= code(row[tGpu]); tpu ||= code(row[tTpu]); common ||= commonOf(row);
      }
    }

    // PO
    let p: string[] | undefined;
    if (tpu) p = poRows.find((r) => code(r[pTpu]) === tpu);
    if (!p && gpu) p = poRows.find((r) => code(r[pGpu]) === gpu);
    const sameTax = billTax ? poRows.filter((r) => code(r[pTax]) === billTax) : poRows;
    if (!p) p = sameTax.find((r) => num(r[pQty]) === it.quantity && Math.abs(num(r[pPrice]) - it.unit_price) < 0.01);
    if (!p) {
      let bs = 0, best: string[] | undefined;
      for (const r of sameTax) {
        const s = Math.max(sim(it.product_name, r[pName] ?? ""), common ? sim(common, r[pName] ?? "") : 0);
        if (s > bs) { bs = s; best = r; }
      }
      if (bs >= 0.55) p = best;
    }
    const poQty = p && pQty >= 0 ? num(p[pQty]) : undefined;
    const poPrice = p && pPrice >= 0 ? num(p[pPrice]) : undefined;
    if (p && !common) common = p[pName] ?? "";
    if (p && !gpu) gpu = code(p[pGpu]);
    if (p && !tpu) tpu = code(p[pTpu]);

    const issues: string[] = [];
    if (!fromTtmt && !p) issues.push("ไม่พบใน TTMT");
    if (!p) issues.push("ไม่พบใน PO");
    else {
      if (poQty !== undefined && poQty !== it.quantity) issues.push("จำนวนไม่ตรง PO");
      if (poPrice !== undefined && Math.abs(poPrice - it.unit_price) > 0.01) issues.push("ราคาไม่ตรง PO");
    }
    return {
      ...it, unit: it.unit ?? "", gpu_code: gpu, tpu_code: tpu, common_name: common, match_score: score,
      po_product: p ? p[pName] : undefined, po_qty: poQty, po_price: poPrice,
      status: issues.length ? issues.join(", ") : "ตรงกัน",
    };
  });
}

// ---------- KPI dashboard (PO vs INV) ----------
export type KpiResult = {
  poCount: number; poValue: number; deliveredCount: number; deliveredValue: number;
  pendingCount: number; pendingValue: number; deliveredPct: number;
  invoiceCount: number; supplierCount: number; issueCount: number;
  topPending: { name: string; company: string; qty: number; value: number }[];
};

/**
 * A PO line counts as delivered when an INV row matches it by TPU/GPU code,
 * else by Tax ID + quantity + unit price, else by drug name within the same Tax ID.
 */
export function computeKpi(po: string[][], inv: string[][]): KpiResult {
  const ph = po[0] ?? [];
  const pTax = findCol(ph, /tax/i), pName = findCol(ph, /drugs?\s*name|ชื่อยา/i);
  const pQty = findCol(ph, /^\s*(qual|quan|qty|จำนวน)/i), pPrice = findCol(ph, /price\s*\/\s*unit|ราคา.*หน่วย/i);
  const pGpu = findCol(ph, /gpu/i), pTpu = findCol(ph, /tpu/i);
  const pCompany = findCol(ph, /company|บริษัท|supplier|vendor/i);
  // INV fixed columns: B invoice_no, C company, D tax, I product, J qty, L unit_price, M total, Q status
  const invRows = inv.slice(1).filter((r) => r[1] || r[8]);
  const poRows = po.slice(1).filter((r) => r[pName]);

  const delivered = new Array(poRows.length).fill(false);
  poRows.forEach((r, i) => {
    const gpu = code(r[pGpu]), tpu = code(r[pTpu]), tax = code(r[pTax]);
    const qty = num(r[pQty]), price = num(r[pPrice]);
    let hit: string[] | undefined;
    if (tpu) hit = invRows.find((v) => code(v[7]) === tpu);
    if (!hit && gpu) hit = invRows.find((v) => code(v[6]) === gpu);
    const sameTax = tax ? invRows.filter((v) => code(v[3]) === tax) : invRows;
    if (!hit) hit = sameTax.find((v) => num(v[9]) === qty && Math.abs(num(v[11]) - price) < 0.01);
    if (!hit) hit = sameTax.find((v) => sim(v[8] ?? "", r[pName] ?? "") >= 0.6);
    delivered[i] = !!hit;
  });

  const valueOf = (r: string[]) => num(r[pQty]) * num(r[pPrice]);
  const poValue = poRows.reduce((s, r) => s + valueOf(r), 0);
  const deliveredRows = poRows.filter((_, i) => delivered[i]);
  const pendingRows = poRows.filter((_, i) => !delivered[i]);
  const deliveredValue = deliveredRows.reduce((s, r) => s + valueOf(r), 0);
  const pendingValue = poValue - deliveredValue;

  const byName = new Map<string, { name: string; company: string; qty: number; value: number }>();
  for (const r of pendingRows) {
    const k = norm(r[pName] ?? "");
    const cur = byName.get(k) ?? { name: r[pName] ?? "-", company: pCompany >= 0 ? (r[pCompany] ?? "") : "", qty: 0, value: 0 };
    cur.qty += num(r[pQty]); cur.value += valueOf(r);
    byName.set(k, cur);
  }
  const topPending = [...byName.values()].sort((a, b) => b.value - a.value).slice(0, 10);

  return {
    poCount: poRows.length, poValue,
    deliveredCount: deliveredRows.length, deliveredValue,
    pendingCount: pendingRows.length, pendingValue,
    deliveredPct: poRows.length ? Math.round((deliveredRows.length / poRows.length) * 100) : 0,
    invoiceCount: new Set(invRows.map((r) => r[1]).filter(Boolean)).size,
    supplierCount: new Set(invRows.map((r) => code(r[3])).filter(Boolean)).size,
    issueCount: invRows.filter((r) => (r[16] ?? "") && r[16] !== "ตรงกัน").length,
    topPending,
  };
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
        { type: "text", text: `${it.common_name || "-"} · ${it.quantity} ${it.unit ?? ""} × ${fmt(it.unit_price)} = ${fmt(it.total_price)}`, size: "xxs", color: "#555555", wrap: true },
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
