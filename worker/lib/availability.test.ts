import { describe, it, expect } from "vitest";
import { toDayOfWeek, londonWallTimeToUtcIso, computeAvailableSlots } from "./availability";

describe("toDayOfWeek", () => {
  it("matches known weekdays regardless of host timezone", () => {
    expect(toDayOfWeek("2026-09-21")).toBe(1); // Monday
    expect(toDayOfWeek("2026-09-22")).toBe(2); // Tuesday
    expect(toDayOfWeek("2026-09-27")).toBe(0); // Sunday
  });
});

describe("londonWallTimeToUtcIso", () => {
  it("resolves BST (UTC+1) correctly in summer", () => {
    // 2026-07-01 09:00 London wall time is BST -> 08:00 UTC.
    expect(londonWallTimeToUtcIso("2026-07-01", "09:00")).toBe("2026-07-01T08:00:00.000Z");
  });

  it("resolves GMT (UTC+0) correctly in winter", () => {
    // 2026-01-15 09:00 London wall time is GMT -> 09:00 UTC.
    expect(londonWallTimeToUtcIso("2026-01-15", "09:00")).toBe("2026-01-15T09:00:00.000Z");
  });
});

describe("computeAvailableSlots", () => {
  const workingBlock = { startTime: "09:00", endTime: "10:00" };

  it("returns empty when not working that day", () => {
    expect(
      computeAvailableSlots({ dateIso: "2026-01-15", durationMinutes: 30, workingBlock: null, bookedIntervals: [] })
    ).toEqual([]);
  });

  it("generates 15-minute-stepped slots that fit within the working block", () => {
    const slots = computeAvailableSlots({
      dateIso: "2026-01-15",
      durationMinutes: 30,
      workingBlock,
      bookedIntervals: [],
    });
    // 09:00-09:30, 09:15-09:45, 09:30-10:00 all fit; 09:45-10:15 does not.
    expect(slots.map((s) => s.startAt)).toEqual([
      "2026-01-15T09:00:00.000Z",
      "2026-01-15T09:15:00.000Z",
      "2026-01-15T09:30:00.000Z",
    ]);
  });

  it("excludes slots that overlap an existing booking", () => {
    const slots = computeAvailableSlots({
      dateIso: "2026-01-15",
      durationMinutes: 30,
      workingBlock,
      bookedIntervals: [{ startAt: "2026-01-15T09:15:00.000Z", endAt: "2026-01-15T09:45:00.000Z" }],
    });
    // 09:00-09:30 overlaps [09:15,09:45); 09:15-09:45 overlaps exactly; 09:30-10:00 overlaps too.
    expect(slots).toEqual([]);
  });

  it("does not exclude a slot that only touches a booking's edge", () => {
    const slots = computeAvailableSlots({
      dateIso: "2026-01-15",
      durationMinutes: 15,
      workingBlock: { startTime: "09:00", endTime: "09:45" },
      bookedIntervals: [{ startAt: "2026-01-15T09:15:00.000Z", endAt: "2026-01-15T09:30:00.000Z" }],
    });
    expect(slots.map((s) => s.startAt)).toEqual(["2026-01-15T09:00:00.000Z", "2026-01-15T09:30:00.000Z"]);
  });

  it("excludes past slots for today", () => {
    const slots = computeAvailableSlots({
      dateIso: "2026-01-15",
      durationMinutes: 15,
      workingBlock,
      bookedIntervals: [],
      nowIso: "2026-01-15T09:20:00.000Z",
    });
    expect(slots.map((s) => s.startAt)).toEqual(["2026-01-15T09:30:00.000Z", "2026-01-15T09:45:00.000Z"]);
  });
});
