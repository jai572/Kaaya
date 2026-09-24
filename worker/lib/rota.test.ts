import { describe, it, expect } from "vitest";
import { expandDateRange, isAppointmentAffected, type RotaExceptionLike, type AppointmentLike } from "./rota";

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
