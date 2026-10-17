import { describe, expect, it } from "vitest";
import { analyzeInvoicePrices } from "@/lib/invoice-pricing";
import { computeKpi, matchItems } from "@/lib/inventory.server";

describe("VAT-inclusive prices", () => {
  it("adds 7% only when line totals reconcile with the inclusive grand total", () => {
    const result = analyzeInvoicePrices([{ quantity: 2, unit_price: 100, total_price: 200 }], 214, 14);
    expect(result.items[0]?.unit_price).toBe(107);
    expect(result.items[0]?.total_price).toBe(214);
    expect(result.analysis.mode).toBe("converted");
  });
  it("prefers explicit inclusive columns without taxing them again", () => {
    const result = analyzeInvoicePrices([{ quantity: 2, unit_price: 100, total_price: 200, vat_inclusive_unit_price: 107, vat_inclusive_total_price: 214 }], 214);
    expect(result.items[0]?.unit_price).toBe(107);
    expect(result.analysis.mode).toBe("inclusive");
  });
  it("leaves already-inclusive prices unchanged", () => {
    expect(analyzeInvoicePrices([{ quantity: 2, unit_price: 107, total_price: 214 }], 214).items[0]?.unit_price).toBe(107);
  });
  it("flags ambiguous discounted totals rather than applying VAT blindly", () => {
    const result = analyzeInvoicePrices([{ quantity: 2, unit_price: 100, total_price: 200 }], 210);
    expect(result.analysis.mode).toBe("review");
    expect(result.items[0]?.unit_price).toBe(100);
  });
});

const headers = ["PO NO", "Tax ID", "Drugs Name", "Quality ", "Price/unit", "GPU", "TPU"];
describe("calculated PO data", () => {
  it("counts real calculated rows, excludes errors/subtotals and distinguishes order count", () => {
    const po = [headers, ["700001", "0105549004037", "Drug A", "20", "230", "", ""], ["700001", "0105549004037", "Drug B", "10", "321", "", ""], ["", "", " ", "", "", "", ""], ["", "", "#REF!", "10", "5", "", ""], ["", "", "Amount: 7810", "", "", "", ""]];
    const k = computeKpi(po, []);
    expect(k.poCount).toBe(2);
    expect(k.poOrderCount).toBe(1);
    expect(k.poValue).toBe(7810);
  });
  it("does not reuse a single INV line for duplicate PO rows", () => {
    const row = ["700001", "105549004037", "Drug A", "2", "107", "123", "456"];
    const inv = [Array(17).fill(""), ["", "INV1", "Company", "0105549004037", "", "", "123", "456", "Drug A", "2", "box", "107", "214"]];
    expect(computeKpi([headers, row, row], inv).deliveredCount).toBe(1);
  });
});
describe("generic suggestions", () => {
  it("ranks likely generic names and preserves a confirmed selection", () => {
    const ttmt = [["GPU", "TPU", "generic", "trade", "manufacturer"], ["111", "222", "Generic A", "Brand A", "Company"]];
    const item = { product_name: "Brand A", quantity: 2, unit_price: 107, total_price: 214 };
    const matched = matchItems([item], ttmt, [], { tax_id: "", company_name: "Company" });
    expect(matched[0]?.candidates?.[0]?.common_name).toBe("Generic A");
    const confirmed = matchItems([{ ...item, common_name: "My generic", generic_confirmed: true }], ttmt, [], { tax_id: "", company_name: "Company" });
    expect(confirmed[0]?.common_name).toBe("My generic");
  });
  it("matches numerically calculated tax IDs with missing leading zero and returns PO number", () => {
    const result = matchItems([{ product_name: "Brand", quantity: 2, unit_price: 107, total_price: 214 }], [], [headers, ["700001", "105549004037", "Generic", "2", "107", "", ""]], { tax_id: "0105549004037", company_name: "Company" });
    expect(result[0]?.po_no).toBe("700001");
    expect(result[0]?.common_name).toBe("Generic");
  });
});