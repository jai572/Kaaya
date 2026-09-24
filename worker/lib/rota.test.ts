import { describe, it, expect } from "vitest";
import {
  expandDateRange,
  isAppointmentAffected,
  effectiveShift,
  isWithinBookingWindow,
  type RotaExceptionLike,
  type AppointmentLike,
} from "./rota";

describe("expandDateRange", () => {
  it("includes both ends", () => {
    expect(expandDateRange("2026-10-20", "2026-10-22")).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
  });

  it("returns a single day when from equals to", () => {
    expect(expandDateRange("2026-10-20", "2026-10-20")).toEqual(["2026-10-20"]);
  });

  it("crosses a month boundary and the BST change without skipping or repeating", () => {
    expect(expandDateRange("2026-10-24", "2026-10-26")).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });

  it("returns nothing for a backwards range", () => {
    expect(expandDateRange("2026-10-22", "2026-10-20")).toEqual([]);
  });
});

describe("isAppointmentAffected", () => {
  const LOC_A = "loc-a";
  const LOC_B = "loc-b";
  // 2026-10-20 is BST (UTC+1): 10:00 London = 09:00Z.
  const appt = (over: Partial<AppointmentLike> = {}): AppointmentLike => ({
    scheduled_at: "2026-10-20T09:00:00.000Z",
    end_at: "2026-10-20T09:30:00.000Z",
    location_id: LOC_A,
    status: "confirmed",
    ...over,
  });
  const off: RotaExceptionLike = { date: "2026-10-20", kind: "off", location_id: null, start_time: null, end_time: null };
  const working = (over: Partial<RotaExceptionLike> = {}): RotaExceptionLike => ({
    date: "2026-10-20",
    kind: "working",
    location_id: LOC_A,
    start_time: "09:00",
    end_time: "13:00",
    ...over,
  });

  it("day off affects any active appointment that day", () => {
    expect(isAppointmentAffected(off, appt())).toBe(true);
    expect(isAppointmentAffected(off, appt({ status: "pending_approval" }))).toBe(true);
  });

  it("ignores cancelled, rescheduled and completed appointments", () => {
    expect(isAppointmentAffected(off, appt({ status: "cancelled" }))).toBe(false);
    expect(isAppointmentAffected(off, appt({ status: "rescheduled" }))).toBe(false);
    expect(isAppointmentAffected(off, appt({ status: "completed" }))).toBe(false);
  });

  it("ignores appointments on other days", () => {
    expect(isAppointmentAffected(off, appt({ scheduled_at: "2026-10-21T09:00:00.000Z", end_at: "2026-10-21T09:30:00.000Z" }))).toBe(false);
  });

  it("uses the London calendar date, not the UTC one", () => {
    // 00:30 London on the 21st is 23:30Z on the 20th.
    expect(isAppointmentAffected(off, appt({ scheduled_at: "2026-10-20T23:30:00.000Z", end_at: "2026-10-21T00:00:00.000Z" }))).toBe(false);
  });

  it("working elsewhere affects an appointment at the usual location", () => {
    expect(isAppointmentAffected(working({ location_id: LOC_B }), appt())).toBe(true);
  });

  it("working shorter hours affects appointments outside them only", () => {
    const lateStart = working({ start_time: "13:00", end_time: "18:00" });
    expect(isAppointmentAffected(lateStart, appt())).toBe(true); // 10:00 London
    expect(isAppointmentAffected(lateStart, appt({ scheduled_at: "2026-10-20T13:00:00.000Z", end_at: "2026-10-20T13:30:00.000Z" }))).toBe(false); // 14:00 London
  });

  it("an appointment inside the new hours at the same location is fine", () => {
    expect(isAppointmentAffected(working(), appt())).toBe(false);
  });

  it("an appointment running past the new end time is affected", () => {
    expect(isAppointmentAffected(working({ end_time: "10:15" }), appt())).toBe(true);
  });
});

describe("effectiveShift", () => {
  const LOC = "loc-a";
  const OTHER = "loc-b";
  const opening = { open_time: "09:00:00", close_time: "18:00:00" };
  const regular = { start_time: "10:00:00", end_time: "17:00:00", location_id: LOC };

  it("uses the regular rota at this location, trimmed to opening hours", () => {
    expect(effectiveShift({ locationId: LOC, regular, exception: null, opening })).toEqual({ startTime: "10:00", endTime: "17:00" });
    expect(
      effectiveShift({ locationId: LOC, regular: { ...regular, start_time: "08:00", end_time: "19:00" }, exception: null, opening })
    ).toEqual({ startTime: "09:00", endTime: "18:00" });
  });

  it("returns null when the regular shift is at another location", () => {
    expect(effectiveShift({ locationId: OTHER, regular, exception: null, opening })).toBeNull();
  });

  it("returns null when the location is closed that day", () => {
    expect(effectiveShift({ locationId: LOC, regular, exception: null, opening: null })).toBeNull();
  });

  it("a day-off exception removes the shift", () => {
    const off = { date: "2026-10-20", kind: "off" as const, location_id: null, start_time: null, end_time: null };
    expect(effectiveShift({ locationId: LOC, regular, exception: off, opening })).toBeNull();
  });

  it("a working exception replaces the regular shift, including moving location", () => {
    const cover = { date: "2026-10-20", kind: "working" as const, location_id: OTHER, start_time: "12:00", end_time: "16:00" };
    expect(effectiveShift({ locationId: LOC, regular, exception: cover, opening })).toBeNull();
    expect(effectiveShift({ locationId: OTHER, regular, exception: cover, opening })).toEqual({ startTime: "12:00", endTime: "16:00" });
  });

  it("a working exception can add a shift on a normal day off", () => {
    const extra = { date: "2026-10-20", kind: "working" as const, location_id: LOC, start_time: "09:00", end_time: "13:00" };
    expect(effectiveShift({ locationId: LOC, regular: null, exception: extra, opening })).toEqual({ startTime: "09:00", endTime: "13:00" });
  });

  it("returns null when shift and opening hours don't overlap", () => {
    expect(
      effectiveShift({ locationId: LOC, regular: { ...regular, start_time: "18:00", end_time: "20:00" }, exception: null, opening })
    ).toBeNull();
  });
});

describe("isWithinBookingWindow", () => {
  it("allows today through today + window days", () => {
    expect(isWithinBookingWindow("2026-10-20", "2026-10-20", 90)).toBe(true);
    expect(isWithinBookingWindow("2027-01-18", "2026-10-20", 90)).toBe(true);
  });

  it("rejects past dates and dates beyond the window", () => {
    expect(isWithinBookingWindow("2026-10-19", "2026-10-20", 90)).toBe(false);
    expect(isWithinBookingWindow("2027-01-19", "2026-10-20", 90)).toBe(false);
  });
});
