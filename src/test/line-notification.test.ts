import { afterEach, describe, expect, it, vi } from "vitest";
import { sendLine } from "@/lib/inventory.server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("LINE notifications", () => {
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