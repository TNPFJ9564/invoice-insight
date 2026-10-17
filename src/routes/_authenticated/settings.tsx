import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { checkAdmin, systemStatus, testLine } from "@/lib/inventory.functions";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "ตั้งค่าระบบ — Sobprab Duugs Inventory" },
      { name: "description", content: "สถานะการเชื่อมต่อ Google Sheets, Drive, LINE และการตั้งค่าแจ้งเตือน" },
      { property: "og:title", content: "ตั้งค่าระบบ — Sobprab Duugs" },
      { property: "og:description", content: "การตั้งค่าผู้ดูแลระบบ" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const [st, setSt] = useState<Awaited<ReturnType<typeof systemStatus>> | null>(null);
  const [notify, setNotify] = useState(true);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    setNotify(localStorage.getItem("sd_notify_line") !== "0");
    checkAdmin().then(({ isAdmin }) => {
      setAdmin(isAdmin);
      if (isAdmin) systemStatus().then(setSt).catch((e) => toast.error(e.message));
    }).catch(() => setAdmin(false));
  }, []);
  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); };
  if (admin === null) return <AppShell kicker="05 — Admin" title="ตั้งค่า"><p className="text-muted-foreground">กำลังตรวจสอบสิทธิ์…</p></AppShell>;
  if (!admin) return (
    <AppShell kicker="05 — Admin" title="ตั้งค่า">
      <p>บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ</p>
      <button onClick={signOut} className="label-caps mt-6 min-h-11 bg-primary px-6 text-primary-foreground">ออกจากระบบ</button>
    </AppShell>
  );
  const row = (l: string, v: React.ReactNode) => (
    <div className="grid grid-cols-12 gap-4 border-t py-4"><dt className="label-caps col-span-12 text-muted-foreground sm:col-span-4">{l}</dt><dd className="col-span-12 sm:col-span-8">{v}</dd></div>
  );
  return (
    <AppShell kicker="05 — Admin" title="ตั้งค่า">
      <dl>
        {row("Google Sheets", st ? (st.sheets === "ok" ? `เชื่อมต่อแล้ว · TTMT ${st.counts.ttmt} · PO ${st.counts.po} รายการ` : st.sheets) : "กำลังตรวจสอบ…")}
        {row("Spreadsheet", st && <a className="underline" target="_blank" rel="noreferrer" href={`https://docs.google.com/spreadsheets/d/${st.sheetId}`}>INV / PO / TTMT</a>)}
        {row("Google Drive", st && <a className="underline" target="_blank" rel="noreferrer" href={`https://drive.google.com/drive/folders/${st.folderId}`}>OCR_PIC_UPLOAD {st.drive ? "· เชื่อมต่อแล้ว" : "· ยังไม่เชื่อมต่อ"}</a>)}
        {row("Database", "Supabase · invoices / invoice_items")}
        {row("LINE OA", st ? (st.line ? "ตั้งค่าแล้ว" : "ยังไม่ได้ตั้งค่า Channel Access Token / Target ID") : "…")}
        {row("แจ้งเตือน LINE", (
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={notify}
              onChange={(e) => { setNotify(e.target.checked); localStorage.setItem("sd_notify_line", e.target.checked ? "1" : "0"); }} />
            ส่ง Flex Message ทุกครั้งที่บันทึกบิล
          </label>
        ))}
        {row("ทดสอบ", <button className="label-caps min-h-11 bg-primary px-6 text-primary-foreground" onClick={async () => {
          const r = await testLine(); r.sent ? toast.success("ส่งข้อความทดสอบแล้ว") : toast.error(r.reason);
        }}>ส่ง LINE ทดสอบ</button>)}
        {row("บัญชี", <button onClick={signOut} className="label-caps min-h-11 border px-6">ออกจากระบบ</button>)}
      </dl>
    </AppShell>
  );
}
