import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, baht } from "@/components/AppShell";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { invoicesQuery } from "@/lib/invoices-query";
import { driveThumb } from "@/lib/export";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "ภาพบิล — Sobprab Duugs Inventory" },
      { name: "description", content: "ภาพบิลที่อัปโหลดทั้งหมด แตะเพื่อดูขนาดเต็ม" },
      { property: "og:title", content: "ภาพบิล — Sobprab Duugs" },
      { property: "og:description", content: "แกลเลอรีภาพบิลที่อัปโหลด" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(invoicesQuery),
  component: Gallery,
});

const full = (url: string) => driveThumb(url).replace("sz=w1200", "sz=w2400");
const small = (url: string) => driveThumb(url).replace("sz=w1200", "sz=w400");

function Gallery() {
  const { data } = useSuspenseQuery(invoicesQuery);
  const list = data.filter((i) => i.image_url);
  const [sel, setSel] = useState<any | null>(null);

  return (
    <AppShell kicker="03 — Images" title="ภาพบิล">
      <p className="text-sm text-muted-foreground">{list.length} ภาพ</p>
      <ul className="mt-6 grid grid-cols-2 gap-px border bg-border sm:grid-cols-3 lg:grid-cols-5">
        {list.map((inv) => (
          <li key={inv.id} className="bg-background">
            <button onClick={() => setSel(inv)} className="block w-full text-left focus-visible:outline-2" aria-label={`ดูภาพบิล ${inv.invoice_no} ขนาดเต็ม`}>
              <img src={small(inv.image_url)} alt="" loading="lazy" className="aspect-[3/4] w-full bg-muted object-cover" />
              <span className="block p-3">
                <span className="block truncate text-sm font-bold">{inv.invoice_no || "-"}</span>
                <span className="block truncate text-xs text-muted-foreground">{inv.company_name}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!list.length && <p className="mt-6 text-muted-foreground">ยังไม่มีภาพบิล</p>}

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent className="max-h-[95dvh] max-w-5xl overflow-auto p-4">
          {sel && (
            <>
              <DialogTitle>{sel.invoice_no || "-"} · {sel.company_name}</DialogTitle>
              <DialogDescription>{sel.invoice_date || "-"} · สุทธิ ฿{baht(sel.grand_total)}</DialogDescription>
              <img src={full(sel.image_url)} alt={`ภาพบิล ${sel.invoice_no} ขนาดเต็ม`} className="w-full border" />
              <a href={sel.image_url} target="_blank" rel="noreferrer" className="label-caps underline">เปิดใน Google Drive</a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
