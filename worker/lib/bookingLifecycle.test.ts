import { describe, it, expect } from "vitest";
import {
  assertTransition,
  isAtLeast24hBefore,
  assertTimeHasArrived,
  assertNotPastScheduledTime,
  LifecycleError,
  NON_BLOCKING_STATUSES,
  sumAppointmentRevenue,
  type AppointmentStatus,
} from "./bookingLifecycle";

describe("assertTransition", () => {
  const validMoves: [AppointmentStatus, AppointmentStatus][] = [
    ["pending_approval", "confirmed"],
    ["pending_approval", "cancelled"],
    ["pending_approval", "rescheduled"],
    ["confirmed", "completed"],
    ["confirmed", "no_show"],
    ["confirmed", "cancelled"],
    ["confirmed", "rescheduled"],
  ];

  it.each(validMoves)("allows %s -> %s", (from, to) => {
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  const invalidMoves: [AppointmentStatus, AppointmentStatus][] = [
    ["pending_approval", "completed"],
    ["pending_approval", "no_show"],
    ["completed", "confirmed"],
    ["completed", "cancelled"],
    ["no_show", "confirmed"],
    ["cancelled", "confirmed"],
    ["cancelled", "pending_approval"],
    ["rescheduled", "confirmed"],
    ["rescheduled", "cancelled"],
  ];

  it.each(invalidMoves)("rejects %s -> %s", (from, to) => {
    expect(() => assertTransition(from, to)).toThrow(LifecycleError);
  });
});

describe("isAtLeast24hBefore", () => {
  it("is true for exactly 24 hours out", () => {
    expect(isAtLeast24hBefore("2026-01-01T09:00:00.000Z", "2026-01-02T09:00:00.000Z")).toBe(true);
  });

  it("is true for well over 24 hours out", () => {
    expect(isAtLeast24hBefore("2026-01-01T09:00:00.000Z", "2026-01-10T09:00:00.000Z")).toBe(true);
  });

  it("is false for one minute under 24 hours", () => {
    expect(isAtLeast24hBefore("2026-01-01T09:00:00.000Z", "2026-01-02T08:59:00.000Z")).toBe(false);
  });

  it("is false for an appointment already in the past", () => {
    expect(isAtLeast24hBefore("2026-01-02T09:00:00.000Z", "2026-01-01T09:00:00.000Z")).toBe(false);
  });
});

describe("assertTimeHasArrived", () => {
  it("throws when the appointment is still in the future", () => {
    expect(() => assertTimeHasArrived("2026-01-02T09:00:00.000Z", "2026-01-01T09:00:00.000Z")).toThrow(LifecycleError);
  });

  it("does not throw once the scheduled time has arrived", () => {
    expect(() => assertTimeHasArrived("2026-01-01T09:00:00.000Z", "2026-01-01T09:00:00.000Z")).not.toThrow();
  });

  it("does not throw once the scheduled time is in the past", () => {
    expect(() => assertTimeHasArrived("2026-01-01T09:00:00.000Z", "2026-01-02T09:00:00.000Z")).not.toThrow();
  });
});

describe("NON_BLOCKING_STATUSES", () => {
  it("releases a slot only for cancelled and rescheduled, never completed/no_show", () => {
    expect(NON_BLOCKING_STATUSES.sort()).toEqual(["cancelled", "rescheduled"]);
  });

  it("excludes every status that still represents an occupied or pending slot", () => {
    const stillOccupying: AppointmentStatus[] = ["pending_approval", "confirmed", "completed", "no_show"];
    for (const status of stillOccupying) {
      expect(NON_BLOCKING_STATUSES).not.toContain(status);
    }
  });
});

describe("sumAppointmentRevenue", () => {
  it("does not count a rescheduled-away appointment's price twice", () => {
    // Reflects the real shape: an original booking rescheduled to a new
    // date. The old row survives as history (status 'rescheduled', its
    // original price_amount untouched) while the new row is what actually
    // counts. If the old row were still counted here too, this date's
    // revenue would include the same booking's price twice.
    const rows: { status: AppointmentStatus; price_amount: number | null }[] = [
      { status: "rescheduled", price_amount: 3500 }, // moved away -- must not count
      { status: "confirmed", price_amount: 2000 },
    ];
    expect(sumAppointmentRevenue(rows)).toBe(2000);
  });

  it("excludes cancelled appointments", () => {
    const rows: { status: AppointmentStatus; price_amount: number | null }[] = [
      { status: "cancelled", price_amount: 4000 },
      { status: "completed", price_amount: 1500 },
    ];
    expect(sumAppointmentRevenue(rows)).toBe(1500);
  });

  it("counts pending_approval, confirmed, completed, and no_show", () => {
    const rows: { status: AppointmentStatus; price_amount: number | null }[] = [
      { status: "pending_approval", price_amount: 100 },
      { status: "confirmed", price_amount: 200 },
      { status: "completed", price_amount: 300 },
      { status: "no_show", price_amount: 400 },
    ];
    expect(sumAppointmentRevenue(rows)).toBe(1000);
  });

  it("treats a null price_amount as zero", () => {
    const rows: { status: AppointmentStatus; price_amount: number | null }[] = [{ status: "confirmed", price_amount: null }];
    expect(sumAppointmentRevenue(rows)).toBe(0);
  });

  it("returns 0 for an empty list", () => {
    expect(sumAppointmentRevenue([])).toBe(0);
  });
});

describe("assertNotPastScheduledTime", () => {
  it("does not throw while the appointment is still in the future", () => {
    expect(() => assertNotPastScheduledTime("2026-01-02T09:00:00.000Z", "2026-01-01T09:00:00.000Z")).not.toThrow();
  });

  it("throws once the scheduled time has arrived (a pending_approval booking can no longer be approved)", () => {
    expect(() => assertNotPastScheduledTime("2026-01-01T09:00:00.000Z", "2026-01-01T09:00:00.000Z")).toThrow(
      LifecycleError
    );
  });

  it("throws once the scheduled time is in the past", () => {
    expect(() => assertNotPastScheduledTime("2026-01-01T09:00:00.000Z", "2026-01-02T09:00:00.000Z")).toThrow(
      LifecycleError
    );
  });
});
