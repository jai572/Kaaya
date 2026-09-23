import { describe, it, expect } from "vitest";
import {
  toDayOfWeek,
  londonWallTimeToUtcIso,
  londonDateIso,
  computeAvailableSlots,
  isWithinWorkingHours,
} from "./availability";

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

describe("londonDateIso", () => {
  it("matches the UTC date when there's no offset (GMT, winter)", () => {
    expect(londonDateIso("2026-01-15T09:00:00.000Z")).toBe("2026-01-15");
  });

  it("rolls over to the next London calendar date during BST near midnight UTC", () => {
    // 2026-07-01 23:30 UTC is 2026-07-02 00:30 in London (BST, UTC+1).
    expect(londonDateIso("2026-07-01T23:30:00.000Z")).toBe("2026-07-02");
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

describe("isWithinWorkingHours", () => {
  const workingBlock = { startTime: "09:00", endTime: "17:00" };

  it("returns false when there is no working block that day", () => {
    expect(
      isWithinWorkingHours({
        dateIso: "2026-01-15",
        startAtIso: "2026-01-15T10:00:00.000Z",
        endAtIso: "2026-01-15T10:30:00.000Z",
        workingBlock: null,
      })
    ).toBe(false);
  });

  it("returns true for an interval fully inside the working block", () => {
    expect(
      isWithinWorkingHours({
        dateIso: "2026-01-15",
        startAtIso: "2026-01-15T10:00:00.000Z",
        endAtIso: "2026-01-15T10:30:00.000Z",
        workingBlock,
      })
    ).toBe(true);
  });

  it("returns false when the interval starts before the working block opens", () => {
    expect(
      isWithinWorkingHours({
        dateIso: "2026-01-15",
        startAtIso: "2026-01-15T08:45:00.000Z",
        endAtIso: "2026-01-15T09:15:00.000Z",
        workingBlock,
      })
    ).toBe(false);
  });

  it("returns true for an interval starting exactly at opening time", () => {
    expect(
      isWithinWorkingHours({
        dateIso: "2026-01-15",
        startAtIso: "2026-01-15T09:00:00.000Z",
        endAtIso: "2026-01-15T09:30:00.000Z",
        workingBlock,
      })
    ).toBe(true);
  });

  it("returns true for an interval ending exactly at closing time", () => {
    expect(
      isWithinWorkingHours({
        dateIso: "2026-01-15",
        startAtIso: "2026-01-15T16:30:00.000Z",
        endAtIso: "2026-01-15T17:00:00.000Z",
        workingBlock,
      })
    ).toBe(true);
  });

  it("returns false when the interval ends after the working block closes", () => {
    expect(
      isWithinWorkingHours({
        dateIso: "2026-01-15",
        startAtIso: "2026-01-15T16:45:00.000Z",
        endAtIso: "2026-01-15T17:15:00.000Z",
        workingBlock,
      })
    ).toBe(false);
  });

  it("returns false for a slot that has already passed", () => {
    expect(
      isWithinWorkingHours({
        dateIso: "2026-01-15",
        startAtIso: "2026-01-15T10:00:00.000Z",
        endAtIso: "2026-01-15T10:30:00.000Z",
        workingBlock,
        nowIso: "2026-01-15T10:05:00.000Z",
      })
    ).toBe(false);
  });
});
