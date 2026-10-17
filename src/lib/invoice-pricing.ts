export type PriceItem = {
  quantity: number; unit_price: number; total_price: number;
  vat_inclusive_unit_price?: number | null | undefined; vat_inclusive_total_price?: number | null | undefined;
};
export type PriceAnalysis = { mode: "inclusive" | "converted" | "review"; note: string; difference: number };
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function analyzeInvoicePrices<T extends PriceItem>(items: T[], grandTotal: number, vatAmount?: number | null) {
  const explicit = items.map((it) => {
    const unit = it.vat_inclusive_unit_price;
    const total = it.vat_inclusive_total_price;
    return { ...it,
      unit_price: unit != null && unit > 0 ? unit : total != null && total > 0 && it.quantity > 0 ? round(total / it.quantity) : it.unit_price,
      total_price: total != null && total > 0 ? total : unit != null && unit > 0 ? round(unit * it.quantity) : it.total_price,
    };
  });
  const sum = explicit.reduce((s, it) => s + it.total_price, 0);
  const tolerance = Math.max(0.05, items.length * 0.02);
  const inclusive = grandTotal > 0 && Math.abs(grandTotal - sum) <= tolerance;
  const hasExplicit = items.some((it) => it.vat_inclusive_unit_price != null || it.vat_inclusive_total_price != null);
  const convert = !inclusive && !hasExplicit && sum > 0 && grandTotal > 0 &&
    Math.abs(round(sum * 1.07) - grandTotal) <= tolerance &&
    (vatAmount == null || Math.abs(vatAmount - round(sum * 0.07)) <= tolerance);
  const result = convert ? explicit.map((it) => ({ ...it, unit_price: round(it.unit_price * 1.07), total_price: round(it.total_price * 1.07) })) : explicit;
  const difference = round(grandTotal - result.reduce((s, it) => s + it.total_price, 0));
  const lineMismatch = result.some((it) => Math.abs(round(it.quantity * it.unit_price) - it.total_price) > Math.max(0.05, it.quantity * 0.005));
  const mode = lineMismatch || (!inclusive && !convert) ? "review" : convert ? "converted" : "inclusive";
  return { items: result, analysis: { mode, difference, note: mode === "converted" ? "ปรับราคาให้รวม VAT 7% ตามยอดสุทธิ" : mode === "inclusive" ? "ราคาที่รวม VAT สอดคล้องกับยอดสุทธิ" : "ยอดราคาไม่สอดคล้องกัน กรุณาตรวจสอบ VAT ส่วนลด และราคาในบิล" } as PriceAnalysis };
}