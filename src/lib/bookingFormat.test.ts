import { describe, it, expect } from "vitest";
import { formatMoney, formatDuration, filterSlotsByStaffMember } from "./bookingFormat";

describe("formatMoney", () => {
  it("formats minor units as GBP currency", () => {
    expect(formatMoney(900, "GBP")).toBe("£9.00");
  });

  it("falls back to 'Price on request' when amount is null", () => {
    expect(formatMoney(null, "GBP")).toBe("Price on request");
  });

  it("falls back to 'Price on request' when currency is null", () => {
    expect(formatMoney(900, null)).toBe("Price on request");
  });
});

describe("formatDuration", () => {
  it("shows minutes under an hour", () => {
    expect(formatDuration(45)).toBe("45 min");
  });

  it("shows whole hours with no leftover minutes", () => {
    expect(formatDuration(60)).toBe("1h");
  });

  it("shows hours plus leftover minutes", () => {
    expect(formatDuration(90)).toBe("1h 30m");
  });

  it("returns empty string for null/zero", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(0)).toBe("");
  });
});

describe("filterSlotsByStaffMember", () => {
  const slots = [
    { staffMemberId: "a", startAt: "10:00" },
    { staffMemberId: "b", startAt: "11:00" },
  ];

  it("returns all slots when staffMemberId is null (any available)", () => {
    expect(filterSlotsByStaffMember(slots, null)).toEqual(slots);
  });

  it("filters to only the matching staff member's slots", () => {
    expect(filterSlotsByStaffMember(slots, "a")).toEqual([slots[0]]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterSlotsByStaffMember(slots, "nonexistent")).toEqual([]);
  });
});
