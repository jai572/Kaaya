import { describe, it, expect } from "vitest";
import {
  assertTransition,
  isAtLeast24hBefore,
  assertTimeHasArrived,
  assertNotPastScheduledTime,
  LifecycleError,
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
