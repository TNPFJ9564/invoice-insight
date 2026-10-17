import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "เข้าสู่ระบบผู้ดูแล — Sobprab Duugs Inventory" },
      { name: "description", content: "เข้าสู่ระบบสำหรับผู้ดูแลระบบเพื่อเข้าหน้าตั้งค่า" },
      { property: "og:title", content: "เข้าสู่ระบบผู้ดูแล — Sobprab Duugs" },
      { property: "og:description", content: "เข้าสู่ระบบผู้ดูแลระบบ" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const field = "w-full border-0 border-b bg-transparent py-2 text-base outline-none focus:border-b-2";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/settings" });
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/settings` } });
        if (error) throw error;
        if (data.session) navigate({ to: "/settings" });
        else toast.success("ส่งอีเมลยืนยันแล้ว กรุณากดลิงก์ในอีเมลเพื่อเปิดใช้งานบัญชี");
      }
    } catch (err) { toast.error((err as Error).message); }
    setBusy(false);
  };

  return (
    <AppShell kicker="05 — Admin" title="เข้าสู่ระบบ">
      <form onSubmit={submit} className="max-w-md space-y-6">
        <label className="block"><span className="label-caps text-muted-foreground">อีเมล</span>
          <input type="email" required autoComplete="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block"><span className="label-caps text-muted-foreground">รหัสผ่าน</span>
          <input type="password" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} className={field} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button disabled={busy} className="min-h-12 w-full bg-primary font-bold text-primary-foreground disabled:opacity-50">
          {busy ? "กำลังดำเนินการ…" : mode === "in" ? "เข้าสู่ระบบ" : "สร้างบัญชีผู้ดูแล"}
        </button>
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="label-caps min-h-11 underline">
          {mode === "in" ? "ยังไม่มีบัญชี? ตั้งรหัสผ่านครั้งแรก" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
        </button>
      </form>
    </AppShell>
  );
}
