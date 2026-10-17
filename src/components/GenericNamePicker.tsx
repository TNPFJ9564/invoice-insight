import type { InvoiceDraft } from "@/lib/inventory.functions";

type Item = InvoiceDraft["items"][number];
export function GenericNamePicker({ item, onSelect }: { item: Item; onSelect: (candidate: NonNullable<Item["candidates"]>[number]) => void }) {
  if (!item.candidates?.length) return null;
  return <select aria-label={`เลือกชื่อสามัญ ${item.product_name}`} className="mt-2 min-h-11 w-full max-w-64 border bg-background px-2 text-sm" value="" onChange={(e) => {
    const candidate = item.candidates?.[Number(e.target.value)];
    if (candidate) onSelect(candidate);
  }}>
    <option value="" disabled>ชื่อสามัญที่เป็นไปได้</option>
    {item.candidates.map((c, i) => <option key={i} value={i}>{c.common_name} · {c.score}% · {c.source}</option>)}
  </select>;
}