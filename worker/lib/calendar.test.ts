import { describe, it, expect } from "vitest";
import { shiftsForRange, staffBookingWarnings, overlaps, sanitiseSearch } from "./calendar";

const LOC = "loc-a";
const OTHER = "loc-b";
// 2026-10-05 is a Monday (dow 1), 2026-10-06 a Tuesday (dow 2)
const opening = [
  { day_of_week: 1, open_time: "09:00:00", close_time: "18:00:00" },
  { day_of_week: 2, open_time: "09:00:00", close_time: "18:00:00" },
];

describe("shiftsForRange", () => {
  it("uses the regular rota, trimmed to opening hours, per date", () => {
    const res = shiftsForRange({
      locationId: LOC,
      dates: ["2026-10-05", "2026-10-06"],
      staffIds: ["s1"],
      regular: [{ staff_member_id: "s1", day_of_week: 1, start_time: "08:00:00", end_time: "17:00:00", location_id: LOC }],
      exceptions: [],
      opening,
    });
    expect(res.s1["2026-10-05"]).toEqual({ startTime: "09:00", endTime: "17:00" });
    expect(res.s1["2026-10-06"]).toBeNull();
  });

  it("an exception moving someone to another location removes them here", () => {
    const res = shiftsForRange({
      locationId: LOC,
      dates: ["2026-10-05"],
      staffIds: ["s1"],
      regular: [{ staff_member_id: "s1", day_of_week: 1, start_time: "09:00:00", end_time: "17:00:00", location_id: LOC }],
      exceptions: [{ staff_member_id: "s1", date: "2026-10-05", kind: "working", location_id: OTHER, start_time: "09:00", end_time: "17:00" }],
      opening,
    });
    expect(res.s1["2026-10-05"]).toBeNull();
  });

  it("keeps staff independent of each other", () => {
    const res = shiftsForRange({
      locationId: LOC,
      dates: ["2026-10-05"],
      staffIds: ["s1", "s2"],
      regular: [{ staff_member_id: "s2", day_of_week: 1, start_time: "12:00:00", end_time: "18:00:00", location_id: LOC }],
      exceptions: [],
      opening,
    });
    expect(res.s1["2026-10-05"]).toBeNull();
    expect(res.s2["2026-10-05"]).toEqual({ startTime: "12:00", endTime: "18:00" });
  });
});

describe("overlaps", () => {
  const a = { start_at: "2026-10-05T09:00:00Z", end_at: "2026-10-05T10:00:00Z" };
  it("touching intervals don't overlap", () => {
    expect(overlaps(a, { start_at: "2026-10-05T10:00:00Z", end_at: "2026-10-05T11:00:00Z" })).toBe(false);
  });
  it("partial overlap counts", () => {
    expect(overlaps(a, { start_at: "2026-10-05T09:59:00Z", end_at: "2026-10-05T11:00:00Z" })).toBe(true);
  });
});

describe("staffBookingWarnings", () => {
  const now = "2026-10-01T09:00:00Z";
  const shift = { startTime: "09:00", endTime: "17:00" };
  // BST: 10:00 London = 09:00Z
  it("no warnings inside the shift and clear of blocks", () => {
    expect(
      staffBookingWarnings({ staffName: "Neha", start_at: "2026-10-05T09:00:00Z", end_at: "2026-10-05T09:30:00Z", shift, blocks: [], nowIso: now })
    ).toEqual([]);
  });
  it("warns when not rostered", () => {
    const w = staffBookingWarnings({ staffName: "Neha", start_at: "2026-10-05T09:00:00Z", end_at: "2026-10-05T09:30:00Z", shift: null, blocks: [], nowIso: now });
    expect(w).toEqual(["Neha isn't on the rota here that day."]);
  });
  it("warns when running past the end of the shift (London time)", () => {
    // 15:45Z = 16:45 London, 30 min runs to 17:15
    const w = staffBookingWarnings({ staffName: "Neha", start_at: "2026-10-05T15:45:00Z", end_at: "2026-10-05T16:15:00Z", shift, blocks: [], nowIso: now });
    expect(w).toEqual(["Outside Neha's hours (09:00–17:00)."]);
  });
  it("warns on blocked time and past times", () => {
    const w = staffBookingWarnings({
      staffName: "Neha",
      start_at: "2026-09-30T12:00:00Z",
      end_at: "2026-09-30T12:30:00Z",
      shift: { startTime: "09:00", endTime: "18:00" },
      blocks: [{ start_at: "2026-09-30T12:15:00Z", end_at: "2026-09-30T12:45:00Z" }],
      nowIso: now,
    });
    expect(w).toEqual(["Overlaps Neha's blocked time.", "That time has already passed."]);
  });
});

describe("sanitiseSearch", () => {
  it("keeps names, phones and emails", () => {
    expect(sanitiseSearch("  O'Neil ")).toBe("O'Neil");
    expect(sanitiseSearch("+44 7378-454500")).toBe("+44 7378-454500");
    expect(sanitiseSearch("jo.smith@example.com")).toBe("jo.smith@example.com");
  });
  it("drops filter syntax and wildcards", () => {
    expect(sanitiseSearch("a,b)(c%_*")).toBe("a b c");
  });
});
