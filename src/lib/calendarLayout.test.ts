import { describe, it, expect } from "vitest";
import {
  londonDayMinutes,
  londonWallToIso,
  hourLabel,
  weekStart,
  layoutLanes,
  visibleWindow,
  durationLabel,
} from "./calendarLayout";

describe("London time conversion", () => {
  it("reads BST instants as London wall-clock", () => {
    expect(londonDayMinutes("2026-10-05T09:00:00Z")).toEqual({ date: "2026-10-05", minutes: 600 });
  });
  it("reads GMT instants as London wall-clock", () => {
    expect(londonDayMinutes("2026-11-16T09:00:00Z")).toEqual({ date: "2026-11-16", minutes: 540 });
  });
  it("late UTC evening in summer is the next London day", () => {
    expect(londonDayMinutes("2026-07-01T23:30:00Z").date).toBe("2026-07-02");
  });
  it("converts London wall time back to UTC on both sides of the clock change", () => {
    expect(londonWallToIso("2026-10-24", "10:00")).toBe("2026-10-24T09:00:00.000Z");
    expect(londonWallToIso("2026-10-26", "10:00")).toBe("2026-10-26T10:00:00.000Z");
  });
});

describe("hourLabel", () => {
  it("formats like the Square calendar", () => {
    expect(hourLabel(540)).toBe("9 am");
    expect(hourLabel(720)).toBe("12 pm");
    expect(hourLabel(780)).toBe("1 pm");
    expect(hourLabel(750)).toBe("12:30 pm");
  });
});

describe("weekStart", () => {
  it("returns the Monday", () => {
    expect(weekStart("2026-09-24")).toBe("2026-09-21");
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
  });
});

describe("layoutLanes", () => {
  it("non-overlapping items each get the full width", () => {
    const res = layoutLanes([
      { id: "a", start: 600, end: 630 },
      { id: "b", start: 630, end: 660 },
    ]);
    expect(res.get("a")).toEqual({ lane: 0, lanes: 1 });
    expect(res.get("b")).toEqual({ lane: 0, lanes: 1 });
  });
  it("overlapping items share the column", () => {
    const res = layoutLanes([
      { id: "a", start: 600, end: 660 },
      { id: "b", start: 610, end: 620 },
      { id: "c", start: 625, end: 640 },
    ]);
    expect(res.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(res.get("b")).toEqual({ lane: 1, lanes: 2 });
    expect(res.get("c")).toEqual({ lane: 1, lanes: 2 });
  });
  it("a later separate cluster starts fresh", () => {
    const res = layoutLanes([
      { id: "a", start: 600, end: 660 },
      { id: "b", start: 600, end: 660 },
      { id: "c", start: 700, end: 720 },
    ]);
    expect(res.get("c")).toEqual({ lane: 0, lanes: 1 });
  });
});

describe("visibleWindow", () => {
  it("spans opening hours and stretches for out-of-hours bookings", () => {
    expect(visibleWindow([{ open: 540, close: 1080 }], [{ start: 1090, end: 1120 }])).toEqual({ start: 540, end: 1140 });
  });
  it("defaults to 9 to 6", () => {
    expect(visibleWindow([], [])).toEqual({ start: 540, end: 1080 });
  });
});

describe("durationLabel", () => {
  it("formats minutes", () => {
    expect(durationLabel(5)).toBe("5 min");
    expect(durationLabel(60)).toBe("1 h");
    expect(durationLabel(75)).toBe("1 h 15 min");
  });
});
