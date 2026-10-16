import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import appLogo from "@/assets/bin-logo.jpg";

const nav = [
  { to: "/", label: "สแกนบิล", n: "01" },
  { to: "/history", label: "ประวัติ", n: "02" },
  { to: "/gallery", label: "ภาพบิล", n: "03" },
  { to: "/items", label: "รายการยา", n: "04" },
  { to: "/dashboard", label: "แดชบอร์ด", n: "05" },
  { to: "/settings", label: "ตั้งค่า", n: "06" },
] as const;

export function AppShell({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3 font-bold">
            <img src={appLogo} alt="บิน — โลโก้นกกำลังบิน" width={1024} height={1024} className="h-14 w-14 shrink-0" />
            <span>SOBPRAB DUUGS<span className="block text-sm font-medium text-muted-foreground">Inventory</span></span>
          </Link>
          <nav aria-label="เมนูหลัก" className="hidden gap-6 md:flex">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="label-caps py-2 text-muted-foreground hover:text-foreground"
                activeProps={{ className: "label-caps py-2 text-foreground underline underline-offset-8" }} activeOptions={{ exact: true }}>
                {n.n} {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-16">
        <p className="label-caps text-muted-foreground">{kicker}</p>
        <h1 className="mt-2 text-4xl md:text-6xl">{title}</h1>
        <div className="mt-8 md:mt-12">{children}</div>
      </main>
      <nav aria-label="เมนูมือถือ" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-background md:hidden">
        {nav.map((n) => (
          <Link key={n.to} to={n.to} className="flex min-h-14 flex-col items-center justify-center text-muted-foreground"
            activeProps={{ className: "flex min-h-14 flex-col items-center justify-center bg-primary text-primary-foreground" }} activeOptions={{ exact: true }}>
            <span className="text-[10px] font-medium">{n.n}</span>
            <span className="text-xs font-medium">{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export const baht = (n: number) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Status({ s }: { s: string }) {
  const ok = s === "ตรงกัน";
  return <span className={`inline-block px-2 py-0.5 text-xs font-medium ${ok ? "bg-primary text-primary-foreground" : "border border-destructive text-destructive"}`}>{ok ? "✓ " : "! "}{s || "-"}</span>;
}
