import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Status, baht } from "@/components/AppShell";
import { invoicesQuery } from "@/lib/invoices-query";
import { exportData } from "@/lib/export";

export const Route = createFileRoute("/items")({
  head: () => ({
    meta: [
      { title: "รายการยาที่บันทึก — Sobprab Duugs Inventory" },
      { name: "description", content: "ตารางรายการยาทั้งหมดจากบิลที่บันทึก" },
      { property: "og:title", content: "รายการยาที่บันทึก — Sobprab Duugs" },
      { property: "og:description", content: "ตารางรายการยา ชื่อการค้า ชื่อสามัญ GPU TPU" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(invoicesQuery),
  component: Items,
});

function Items() {
  const { data } = useSuspenseQuery(invoicesQuery);
  const [q, setQ] = useState("");
  const rows = data.flatMap((inv) => inv.invoice_items.map((it: any) => ({ ...it, inv })))
    .filter((r) => `${r.product_name} ${r.common_name} ${r.inv.invoice_no} ${r.gpu_code} ${r.tpu_code}`.toLowerCase().includes(q.toLowerCase()));
  const total = rows.reduce((s, r) => s + Number(r.total_price || 0), 0);

  return (
    <AppShell kicker="03 — Ledger" title="รายการยา">
      <div className="flex flex-wrap items-end gap-4">
        <label className="min-w-60 flex-1"><span className="label-caps text-muted-foreground">ค้นหา</span>
          <input className="w-full border-0 border-b bg-transparent py-2 outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อยา / GPU / TPU / เลขบิล" /></label>
        {(["xlsx", "csv", "json"] as const).map((k) => <button key={k} onClick={() => exportData(data, k)} className="label-caps min-h-11 border px-4">{k.toUpperCase()}</button>)}
      </div>
      <p className="mt-6 text-sm">{rows.length} รายการ · รวม <strong>฿{baht(total)}</strong></p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="border-b-2 text-left">
            {["เลขที่บิล", "วันที่", "ชื่อการค้า", "ชื่อสามัญ", "GPU", "TPU", "จำนวน", "หน่วย", "ราคา/หน่วย", "รวม", "สถานะ"].map((h) => <th key={h} className="label-caps py-2 pr-3">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2 pr-3 font-medium">{r.inv.invoice_no}</td>
                <td className="pr-3">{r.inv.invoice_date}</td>
                <td className="pr-3 font-bold">{r.product_name}</td>
                <td className="pr-3">{r.common_name}</td>
                <td className="pr-3">{r.gpu_code}</td>
                <td className="pr-3">{r.tpu_code}</td>
                <td className="pr-3 text-right">{r.quantity}</td>
                <td className="pr-3">{r.unit}</td>
                <td className="pr-3 text-right">{baht(r.unit_price)}</td>
                <td className="pr-3 text-right">{baht(r.total_price)}</td>
                <td><Status s={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
