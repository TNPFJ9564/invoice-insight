import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell, Status, baht } from "@/components/AppShell";
import { processInvoice, rematchItems, saveInvoice, type InvoiceDraft } from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { GenericNamePicker } from "@/components/GenericNamePicker";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "สแกนบิล — Sobprab Duugs Inventory" },
      { name: "description", content: "ถ่ายภาพหรืออัปโหลดบิลยา เพื่อสกัดข้อมูลด้วย OCR และตรวจสอบกับ PO" },
      { property: "og:title", content: "สแกนบิล — Sobprab Duugs Inventory" },
      { property: "og:description", content: "OCR บิลยา จับคู่ชื่อสามัญ และตรวจสอบกับใบสั่งซื้อ" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScanPage,
});

type Job = { key: string; name: string; preview: string; state: "processing" | "ready" | "saving" | "saved" | "error"; error?: string; draft?: InvoiceDraft; note?: string };

const toB64 = (f: File) => new Promise<{ base64: string; mime: string }>((res, rej) => {
  const img = new Image();
  const url = URL.createObjectURL(f);
  img.onload = () => {
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = img.width * scale; c.height = img.height * scale;
    const context = c.getContext("2d");
    if (!context) { URL.revokeObjectURL(url); rej(new Error("ไม่สามารถอ่านรูปภาพได้")); return; }
    context.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    res({ base64: c.toDataURL("image/jpeg", 0.88).split(",")[1] ?? "", mime: "image/jpeg" });
  };
  img.onerror = rej; img.src = url;
});

function ScanPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const qc = useQueryClient();
  const patch = (key: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...p } : j)));

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const newJobs = list.map((f) => ({ key: crypto.randomUUID(), name: f.name, preview: URL.createObjectURL(f), state: "processing" as const }));
    setJobs((js) => [...newJobs, ...js]);
    await Promise.all(list.map(async (f, i) => {
      const key = newJobs[i]?.key;
      if (!key) return;
      try {
        const { base64, mime } = await toB64(f);
        const r = await processInvoice({ data: { base64, mime, name: f.name } });
        patch(key, { state: "ready", draft: r.draft, note: r.driveError ? `อัปโหลด Drive ไม่สำเร็จ: ${r.driveError}` : `อ้างอิง TTMT ${r.refCounts.ttmt} / PO ${r.refCounts.po} รายการ` });
      } catch (e) { patch(key, { state: "error", error: (e as Error).message }); }
    }));
  };

  const save = async (j: Job) => {
    if (!j.draft) return;
    patch(j.key, { state: "saving" });
    try {
      const notify = localStorage.getItem("sd_notify_line") !== "0";
      const r = await saveInvoice({ data: { invoice: j.draft, notify } });
      patch(j.key, { state: "saved" });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard-kpi"] });
      toast.success(`บันทึกบิล ${j.draft.invoice_no} สำเร็จ`, { description: [r.sheetError && `Sheets: ${r.sheetError}`, r.line.sent ? "ส่ง LINE แล้ว" : `LINE: ${r.line.reason}`].filter(Boolean).join(" · ") });
    } catch (e) { patch(j.key, { state: "ready" }); toast.error((e as Error).message); }
  };

  return (
    <AppShell kicker="01 — Capture" title="สแกนบิล">
      <section className="grid gap-px border bg-border md:grid-cols-2" aria-label="อัปโหลด">
        <label className="flex min-h-40 cursor-pointer flex-col justify-between bg-primary p-6 text-primary-foreground focus-within:outline-2">
          <span className="label-caps">A / กล้อง</span>
          <span className="text-2xl font-bold">ถ่ายภาพบิล →</span>
          <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <label className="flex min-h-40 cursor-pointer flex-col justify-between bg-background p-6 focus-within:outline-2">
          <span className="label-caps text-muted-foreground">B / ไฟล์</span>
          <span className="text-2xl font-bold">อัปโหลดหลายรูป +</span>
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </label>
      </section>

      <div className="mt-12 space-y-16" aria-live="polite">
        {jobs.map((j) => <JobCard key={j.key} job={j} onChange={(d) => patch(j.key, { draft: d })} onSave={() => save(j)} />)}
        {!jobs.length && <p className="text-muted-foreground">ยังไม่มีบิล — ถ่ายภาพหรือเลือกไฟล์เพื่อเริ่มต้น</p>}
      </div>
    </AppShell>
  );
}

const field = "w-full border-0 border-b bg-transparent py-2 text-base outline-none focus:border-b-2";

function JobCard({ job, onChange, onSave }: { job: Job; onChange: (d: InvoiceDraft) => void; onSave: () => void }) {
  const d = job.draft;
  const [busy, setBusy] = useState(false);
  const set = (k: keyof InvoiceDraft, v: string) => d && onChange({ ...d, [k]: k === "grand_total" ? Number(v) : v });
  const setItem = (i: number, k: string, v: string) => {
    if (!d) return;
    const items = d.items.map((it, idx) => idx === i ? { ...it, [k]: ["quantity", "unit_price", "total_price"].includes(k) ? Number(v) : v, ...(["common_name", "gpu_code", "tpu_code"].includes(k) ? { generic_confirmed: true } : {}) } : it);
    onChange({ ...d, items });
  };
  const chooseGeneric = async (i: number, candidate: NonNullable<InvoiceDraft["items"][number]["candidates"]>[number]) => {
    if (!d) return;
    const items = d.items.map((it, idx) => idx === i ? { ...it, common_name: candidate.common_name, gpu_code: candidate.gpu_code, tpu_code: candidate.tpu_code, generic_confirmed: true, match_score: candidate.score } : it);
    onChange({ ...d, items });
    setBusy(true);
    try { onChange({ ...d, items: await rematchItems({ data: { items, tax_id: d.tax_id, company_name: d.company_name } }) as InvoiceDraft["items"] }); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const rematch = async () => {
    if (!d) return; setBusy(true);
    try { onChange({ ...d, items: await rematchItems({ data: { items: d.items, tax_id: d.tax_id, company_name: d.company_name } }) as any }); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const sum = d?.items.reduce((s, i) => s + Number(i.total_price || 0), 0) ?? 0;

  return (
    <article className="grid gap-8 border-t pt-6 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <p className="label-caps text-muted-foreground">{job.state === "processing" ? "กำลังวิเคราะห์…" : job.state === "saved" ? "บันทึกแล้ว ✓" : job.state === "error" ? "ผิดพลาด" : "รอตรวจสอบ"}</p>
        <img src={job.preview} alt={`ภาพบิล ${job.name}`} className="mt-3 w-full border object-contain" />
        {job.note && <p className="mt-2 text-xs text-muted-foreground">{job.note}</p>}
        {d?.image_url && <a href={d.image_url} target="_blank" rel="noreferrer" className="mt-2 block text-xs underline">เปิดใน Google Drive</a>}
      </div>
      <div className="lg:col-span-9">
        {job.state === "processing" && <div className="h-40 animate-pulse bg-muted" />}
        {job.state === "error" && <p className="text-destructive">{job.error}</p>}
        {d && (
          <>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {([["company_name", "ชื่อบริษัท"], ["tax_id", "เลขผู้เสียภาษี"], ["po_no", "เลข PO"], ["invoice_no", "เลขที่บิล"], ["invoice_date", "วันที่บิล"], ["salesperson", "พนักงานขาย"], ["grand_total", "ราคารวมสุทธิ (รวม VAT)"]] as const).map(([k, l]) => (
                <label key={k} className="block">
                  <span className="label-caps text-muted-foreground">{l}</span>
                  <input className={field} value={String(d[k] ?? "")} onChange={(e) => set(k, e.target.value)} inputMode={k === "grand_total" ? "decimal" : undefined} />
                </label>
              ))}
            </div>

            <div className="mt-8 flex items-baseline justify-between">
              <h2 className="text-xl">รายการสินค้า · {d.items.length}</h2>
              <Button variant="link" onClick={rematch} disabled={busy || job.state !== "ready"} className="label-caps min-h-11">{busy ? "กำลังจับคู่…" : "จับคู่ใหม่"}</Button>
            </div>
            {d.price_analysis && <p role="status" className={`mt-3 border-l-2 pl-3 text-sm ${d.price_analysis.mode === "review" ? "border-destructive text-destructive" : "border-primary text-muted-foreground"}`}>{d.price_analysis.note}</p>}

            {/* mobile cards */}
            <ul className="mt-4 space-y-4 md:hidden">
              {d.items.map((it, i) => (
                <li key={i} className="border p-4">
                  <input aria-label="ชื่อสินค้า" className={`${field} font-bold`} value={it.product_name} onChange={(e) => setItem(i, "product_name", e.target.value)} />
                  <input aria-label="ชื่อสามัญ" placeholder="ชื่อสามัญ" className={field} value={it.common_name} onChange={(e) => setItem(i, "common_name", e.target.value)} />
                  <GenericNamePicker item={it} onSelect={(c) => chooseGeneric(i, c)} />
                  <div className="grid grid-cols-4 gap-3">
                    {(["quantity", "unit", "unit_price", "total_price"] as const).map((k) => (
                      <label key={k}><span className="label-caps text-muted-foreground">{k === "quantity" ? "จำนวน" : k === "unit" ? "หน่วย" : k === "unit_price" ? "ราคา/หน่วย" : "รวม"}</span>
                        <input inputMode={k === "unit" ? undefined : "decimal"} className={field} value={String(it[k] ?? "")} onChange={(e) => setItem(i, k, e.target.value)} /></label>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">{(["gpu_code", "tpu_code"] as const).map((k) => <label key={k}><span className="label-caps text-muted-foreground">{k === "gpu_code" ? "GPU" : "TPU"}</span><input className={field} value={it[k]} onChange={(e) => setItem(i, k, e.target.value)} /></label>)}</div>
                  <p className="mt-2 text-xs text-muted-foreground">GPU {it.gpu_code || "-"} · TPU {it.tpu_code || "-"} · PO: {it.po_product ?? "-"} ({it.po_qty ?? "-"} × {it.po_price ?? "-"})</p>
                  <Status s={it.status} />
                </li>
              ))}
            </ul>

            {/* tablet / desktop table */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead><tr className="border-b-2 text-left">
                  {["ชื่อการค้า", "ชื่อสามัญ", "GPU", "TPU", "จำนวน", "หน่วย", "ราคา/หน่วย", "รวม", "PO", "สถานะ"].map((h) => <th key={h} className="label-caps py-2 pr-3">{h}</th>)}
                </tr></thead>
                <tbody>
                  {d.items.map((it, i) => (
                    <tr key={i} className="border-b align-top">
                      {(["product_name", "common_name", "gpu_code", "tpu_code", "quantity", "unit", "unit_price", "total_price"] as const).map((k) => (
                        <td key={k} className="pr-3"><input aria-label={k} className={`${field} min-w-16`} value={String(it[k] ?? "")} onChange={(e) => setItem(i, k, e.target.value)} />{k === "common_name" && <GenericNamePicker item={it} onSelect={(c) => chooseGeneric(i, c)} />}</td>
                      ))}
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{it.po_product ?? "-"}<br />{it.po_qty ?? "-"} × {it.po_price ?? "-"}</td>
                      <td className="py-2"><Status s={it.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t-2 pt-4">
              <p className="text-sm">รวมรายการ ฿{baht(sum)} · สุทธิ <strong className="text-2xl">฿{baht(d.grand_total)}</strong></p>
              {Math.abs(sum - d.grand_total) > 0.05 && <p className="text-sm text-destructive">ส่วนต่างจากยอดสุทธิ ฿{baht(d.grand_total - sum)}</p>}
              <Button onClick={onSave} disabled={job.state !== "ready" || busy} className="min-h-12 px-8 font-bold">
                {job.state === "saving" ? "กำลังบันทึก…" : job.state === "saved" ? "บันทึกแล้ว" : "ยืนยันและบันทึก"}
              </Button>
            </div>
            {d.raw_text && (
              <details className="mt-4"><summary className="label-caps min-h-11 cursor-pointer py-3">ข้อความ OCR ทั้งหมด</summary>
                <textarea aria-label="ข้อความ OCR ทั้งหมด" value={d.raw_text} onChange={(e) => set("raw_text", e.target.value)} className="min-h-48 w-full bg-muted p-4 text-xs" /></details>
            )}
          </>
        )}
      </div>
    </article>
  );
}

