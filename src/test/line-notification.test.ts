import { afterEach, describe, expect, it, vi } from "vitest";
import { sendLine } from "@/lib/inventory.server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("LINE notifications", () => {
  it("includes timestamp, PO, invoice, count, total and labeled drug prices", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "test-token");
    vi.stubEnv("LINE_TARGET_ID", "test-target");
    const request = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", request);
    await sendLine({ invoice_no: "INV-7", po_no: "PO-9", timestamp: "17/10/2026 15:54", company_name: "Test", invoice_date: "17/10/2026", salesperson: "", grand_total: 214,
      items: [{ product_name: "Drug A", common_name: "", quantity: 2, unit: "กล่อง", unit_price: 107, total_price: 214, status: "ตรงกัน", match_score: 100 }] });
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body ?? "{}");
    const bubbles = body.messages[0].contents.contents;
    const textValues = (node: any): string[] => [typeof node.text === "string" ? node.text : "", ...(Array.isArray(node.contents) ? node.contents.flatMap(textValues) : []), ...[node.body, node.header].filter(Boolean).flatMap(textValues)];
    const summary = textValues(bubbles[0]);
    expect(summary).toEqual(expect.arrayContaining(["17/10/2026 15:54", "PO-9", "INV-7", "1", "฿214.00"]));
    expect(textValues(bubbles[1])).toEqual(expect.arrayContaining(["Drug A", "2 กล่อง", "ราคา/หน่วย", "฿107.00", "ราคารวมรายการ", "฿214.00"]));
  });
  it.each([0, 1, 6, 60])("uses equal bubble sizes for %i items and sends once", async (count) => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "test-token");
    vi.stubEnv("LINE_TARGET_ID", "test-target");
    const request = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", request);
    const result = await sendLine({
      invoice_no: "TEST-001", company_name: "ทดสอบระบบ", invoice_date: "-", salesperson: "-", grand_total: 0,
      items: Array.from({ length: count }, (_, i) => ({
        product_name: `รายการ ${i + 1}`, common_name: "test", gpu_code: "", tpu_code: "", unit: "กล่อง",
        quantity: 1, unit_price: 0, total_price: 0, status: "ตรงกัน", match_score: 100,
      })),
    });
    expect(result).toEqual({ sent: true });
    expect(request).toHaveBeenCalledTimes(1);
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body ?? "{}");
    expect(body.messages).toHaveLength(1);
    const contents = body.messages[0].contents;
    const bubbles = contents.type === "carousel" ? contents.contents : [contents];
    expect(bubbles.length).toBeLessThanOrEqual(12);
    expect(bubbles.every((bubble: { size: string }) => bubble.size === "kilo")).toBe(true);
  });
});