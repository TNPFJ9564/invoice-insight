import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { AppShell, baht } from "@/components/AppShell";
import { dashboardKpi } from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

const kpiQuery = queryOptions({
  queryKey: ["dashboard-kpi"],
  queryFn: () => dashboardKpi(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "แดชบอร์ด KPI — Sobprab Duugs Inventory" },
      { name: "description", content: "สรุปใบสั่งซื้อเทียบกับบิลที่จัดส่งแล้ว มูลค่า รายการค้างส่ง และสถิติอื่น" },
      { property: "og:title", content: "แดชบอร์ด KPI — Sobprab Duugs" },
      { property: "og:description", content: "สรุปใบสั่งซื้อเทียบกับบิลที่จัดส่งแล้ว" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(kpiQuery),
  component: Dashboard,
});

function Card({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className="border bg-background p-5">
      <p className="label-caps text-muted-foreground">{label}</p>
      <p className={`mt-2 font-bold tabular-nums ${big ? "text-4xl md:text-5xl" : "text-3xl"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Dashboard() {
  const { data: k, isFetching } = useSuspenseQuery(kpiQuery);
  const qc = useQueryClient();

  return (
    <AppShell kicker="06 — Dashboard" title="แดชบอร์ด KPI">
      <div className="mb-4 flex justify-end"><Button variant="outline" disabled={isFetching} onClick={() => qc.invalidateQueries({ queryKey: ["dashboard-kpi"] })}><RefreshCw className={isFetching ? "animate-spin" : ""} />อัปเดตข้อมูล</Button></div>
      <div className="grid grid-cols-2 gap-px border bg-border lg:grid-cols-4">
        <Card label="รายการยาที่สั่ง" value={k.poCount.toLocaleString("th-TH")} sub={`${k.poOrderCount.toLocaleString("th-TH")} ใบสั่งซื้อ (เลข PO ไม่ซ้ำ)`} big />
        <Card label="มูลค่ารวมทั้งหมด" value={`฿${baht(k.poValue)}`} sub="จำนวน × ราคาต่อหน่วย" big />
        <Card label="จัดส่งแล้ว" value={k.deliveredCount.toLocaleString("th-TH")} sub={`฿${baht(k.deliveredValue)} · ${k.deliveredPct}%`} big />
        <Card label="ยังไม่ส่ง" value={k.pendingCount.toLocaleString("th-TH")} sub={`฿${baht(k.pendingValue)}`} big />
      </div>

      <div className="mt-px grid grid-cols-2 gap-px border-x border-b bg-border lg:grid-cols-4">
        <Card label="บิลที่บันทึก" value={k.invoiceCount.toLocaleString("th-TH")} />
        <Card label="บริษัทที่ส่งของ" value={k.supplierCount.toLocaleString("th-TH")} />
        <Card label="รายการต้องตรวจสอบ" value={k.issueCount.toLocaleString("th-TH")} sub="จำนวน/ราคาไม่ตรง PO" />
        <Card label="อัตราการจัดส่ง" value={`${k.deliveredPct}%`} sub="ของรายการ PO ทั้งหมด" />
      </div>

      <div className="mt-6 border bg-background">
        <p className="label-caps p-3 text-muted-foreground">รายการค้างส่งมูลค่าสูงสุด</p>
        <div className="h-1.5 bg-muted">
          <div className="h-full bg-primary" style={{ width: `${k.deliveredPct}%` }} />
        </div>
        <ul className="divide-y">
          {k.topPending.map((t, i) => (
            <li key={i} className="flex items-baseline justify-between gap-4 p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{t.name}</span>
                {t.company && <span className="block truncate text-xs text-muted-foreground">{t.company}</span>}
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                {t.qty.toLocaleString("th-TH")} หน่วย · ฿{baht(t.value)}
              </span>
            </li>
          ))}
          {!k.topPending.length && <li className="p-3 text-sm text-muted-foreground">ไม่มีรายการค้างส่ง</li>}
        </ul>
      </div>
    </AppShell>
  );
}
