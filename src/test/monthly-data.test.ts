import { describe, expect, it } from "vitest";
import { bangkokMonth, monthBounds, timestampMonth, groupSheetMonths, mergeArchiveRows } from "@/lib/monthly-data";

describe("Monthly Timestamp history", () => {
  it("defaults to the current month in Bangkok at the UTC boundary", () => {
    expect(bangkokMonth(new Date("2026-09-30T17:00:00Z"))).toBe("2026-10");
    expect(monthBounds("2026-10")).toEqual({ start: "2026-09-30T17:00:00.000Z", end: "2026-10-31T17:00:00.000Z" });
  });
  it("groups Thai Timestamp by month, not invoice date", () => {
    expect(timestampMonth("24/10/2569 09:36:00")).toBe("2026-10");
    expect(timestampMonth("2026-09-30T18:00:00Z")).toBe("2026-10");
    const result = groupSheetMonths("INV", [["Timestamp", "Invoice Date"], ["24/10/2569", "1/9/2569"], ["1/9/2569", "1/10/2569"]]);
    expect(result.groups.get("2026-10")).toEqual([["24/10/2569", "1/9/2569"]]);
    expect(result.groups.get("2026-09")?.length).toBe(1);
  });
  it("uses PO Timestamp or capture month when PO has no Timestamp", () => {
    const now = new Date("2026-10-24T02:36:00Z");
    expect(groupSheetMonths("PO", [["PO NO", "Date request"], ["1", "1/9/2569"]], now).groups.has("2026-10")).toBe(true);
    expect(groupSheetMonths("PO", [["Timestamp", "PO NO"], ["1/9/2569", "1"]], now).groups.has("2026-09")).toBe(true);
  });
  it("keeps old PO rows after sheet replacement and repeated synchronization", () => {
    const old = [["PO1", "Drug A"]], fresh = [["PO2", "Drug B"]];
    const saved = mergeArchiveRows(old, fresh);
    expect(saved).toEqual([...old, ...fresh]);
    expect(mergeArchiveRows(saved, fresh)).toEqual(saved);
  });
  it("preserves legitimate repeated PO lines without multiplying them on refresh", () => {
    const row = ["PO1", "Drug A"];
    expect(mergeArchiveRows([row], [row, row])).toEqual([row, row]);
    expect(mergeArchiveRows([row, row], [row, row])).toHaveLength(2);
  });
});