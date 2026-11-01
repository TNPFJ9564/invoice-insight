import { useNavigate } from "@tanstack/react-router";
import { bangkokMonth } from "@/lib/monthly-data";

const label = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
const shift = (m: string, by: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1 + by, 1)); return d.toISOString().slice(0, 7); };

export function MonthPicker({ month }: { month: string }) {
  const navigate = useNavigate();
  const current = bangkokMonth();
  const go = (m: string) => navigate({ to: ".", search: (old: Record<string, unknown>) => ({ ...old, month: m === current ? undefined : m }) } as never);
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 border-b pb-4" aria-label="เลือกเดือน">
      <button className="label-caps min-h-11 border px-4" onClick={() => go(shift(month, -1))} aria-label="เดือนก่อนหน้า">←</button>
      <label className="flex items-center gap-2"><span className="label-caps text-muted-foreground">เดือน</span>
        <input type="month" max={current} value={month} onChange={(e) => e.target.value && go(e.target.value)} className="min-h-11 border bg-background px-3" /></label>
      <button className="label-caps min-h-11 border px-4 disabled:opacity-40" disabled={month >= current} onClick={() => go(shift(month, 1))} aria-label="เดือนถัดไป">→</button>
      <span className="text-sm font-bold">{label(month)}</span>
      {month !== current && <button className="label-caps min-h-11 bg-primary px-4 text-primary-foreground" onClick={() => go(current)}>เดือนปัจจุบัน</button>}
    </div>
  );
}
