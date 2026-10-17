import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, Status, baht } from "@/components/AppShell";
import { invoicesQuery } from "@/lib/invoices-query";
import { deleteInvoice } from "@/lib/inventory.functions";
import { driveThumb, exportData } from "@/lib/export";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "ประวัติการบันทึก — Sobprab Duugs Inventory" },
      { name: "description", content: "ประวัติบิลที่บันทึก พร้อมภาพบิลและรายการยา" },
      { property: "og:title", content: "ประวัติการบันทึก — Sobprab Duugs" },
      { property: "og:description", content: "ดูบิลที่บันทึกแล้ว ภาพบิล และส่งออกข้อมูล" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(invoicesQuery),
  component: History,
});

function History() {
  const { data, refetch, isFetching } = useSuspenseQuery(invoicesQuery);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = data.filter((i) => `${i.invoice_no} ${i.company_name}`.toLowerCase().includes(q.toLowerCase()));

  const del = async (id: string) => {
    if (!confirm("ลบบิลนี้ออกจากฐานข้อมูล?")) return;
    await deleteInvoice({ data: { id } }); toast.success("ลบแล้ว"); qc.invalidateQueries({ queryKey: ["invoices"] });
  };

  return (
    <AppShell kicker="02 — Archive" title="ประวัติการบันทึก">
      <div className="flex flex-wrap items-end gap-4">
        <label className="min-w-60 flex-1"><span className="label-caps text-muted-foreground">ค้นหา</span>
          <input className="w-full border-0 border-b bg-transparent py-2 outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลขที่บิล / บริษัท" /></label>
        {(["xlsx", "csv", "json"] as const).map((k) => (
          <button key={k} onClick={() => exportData(list, k)} className="label-caps min-h-11 border px-4">{k.toUpperCase()}</button>
        ))}
        <button onClick={() => refetch()} className="label-caps min-h-11 bg-primary px-4 text-primary-foreground">{isFetching ? "กำลังซิงค์…" : "ซิงค์"}</button>
      </div>

      <ul className="mt-8">
        {list.map((inv) => (
          <li key={inv.id} className="border-t">
            <button onClick={() => setOpen(open === inv.id ? null : inv.id)} aria-expanded={open === inv.id}
              className="grid w-full grid-cols-12 items-baseline gap-2 py-4 text-left">
              <span className="col-span-12 text-xs text-muted-foreground sm:col-span-2">{new Date(inv.created_at).toLocaleString("th-TH")}</span>
              <span className="col-span-6 font-bold sm:col-span-3">{inv.invoice_no || "-"}</span>
              <span className="col-span-6 text-right sm:col-span-2 sm:order-last">฿{baht(inv.grand_total)}</span>
              <span className="col-span-8 truncate sm:col-span-3">{inv.company_name}</span>
              <span className="col-span-4 text-right sm:col-span-2"><Status s={inv.status} /></span>
            </button>
            {open === inv.id && (
              <div className="grid gap-6 pb-8 md:grid-cols-12">
                <div className="md:col-span-4">
                  {inv.image_url ? <a href={inv.image_url} target="_blank" rel="noreferrer"><img src={driveThumb(inv.image_url)} alt={`ภาพบิล ${inv.invoice_no}`} className="w-full border" loading="lazy" /></a>
                    : <p className="text-muted-foreground">ไม่มีภาพ</p>}
                </div>
                <div className="md:col-span-8 text-sm">
                  <p>เลขผู้เสียภาษี {inv.tax_id || "-"} · วันที่ {inv.invoice_date || "-"} · พนักงานขาย {inv.salesperson || "-"}</p>
                  <ul className="mt-4">
                    {inv.invoice_items.map((it: any) => (
                      <li key={it.id} className="flex justify-between gap-4 border-b py-2">
                        <span><strong>{it.product_name}</strong><br /><span className="text-xs text-muted-foreground">{it.common_name} · GPU {it.gpu_code || "-"} · TPU {it.tpu_code || "-"}</span></span>
                        <span className="text-right">{it.quantity} {it.unit} × {baht(it.unit_price)}<br /><strong>{baht(it.total_price)}</strong></span>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => del(inv.id)} className="label-caps mt-4 min-h-11 text-destructive underline">ลบบิล</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {!list.length && <li className="border-t py-8 text-muted-foreground">ยังไม่มีข้อมูล</li>}
      </ul>
    </AppShell>
  );
}
