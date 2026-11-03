import { describe, expect, it } from "vitest";
import { invoicesFromSheet, timestampIso } from "@/lib/sheet-invoices";

const H = ["Timestamp"];
const row = (ts: string, no: string, product: string, total = 100) =>
  [ts, no, "บริษัท ก", "'0105", "1/11/2569", "สมชาย", "G1", "T1", product, 2, "กล่อง", 50, total, 200, "", "Para", "ตรงกัน", "PO9"];

describe("Admin-entered INV sheet rows", () => {
  it("groups rows into the month of their Timestamp", () => {
    const out = invoicesFromSheet([H, row("3/11/2569 10:00:00", "A1", "x"), row("3/11/2569", "A1", "y"), row("30/10/2569", "B1", "z")], "2026-11", []);
    expect(out).toHaveLength(1);
    expect(out[0].invoice_items).toHaveLength(2);
    expect(out[0].tax_id).toBe("0105");
    expect(out[0].invoice_items[0].po_no).toBe("PO9");
  });
  it("skips bills the app already saved", () => {
    expect(invoicesFromSheet([H, row("3/11/2569", "A1", "x")], "2026-11", [{ invoice_no: "A1", company_name: "บริษัท ก" }])).toHaveLength(0);
  });
  it("reads Thai timestamps as Bangkok time", () => {
    expect(timestampIso("3/11/2569 10:32:00")).toBe("2026-11-03T03:32:00.000Z");
  });
});
