import { describe, it, expect } from "vitest";
import { formatMoney, formatDuration, filterSlotsByStaffMember, groupServicesByCategory, isOnlineBookable } from "./bookingFormat";

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

describe("groupServicesByCategory", () => {
  const services = [
    { id: "1", category_slug: "threading" },
    { id: "2", category_slug: "waxing" },
    { id: "3", category_slug: "nails" },
    { id: "4", category_slug: "shellac" },
    { id: "5", category_slug: "vinylux" },
    { id: "6", category_slug: "lash-lift" },
    { id: "7", category_slug: "eyelash-extensions" },
    { id: "8", category_slug: "patch-test" },
  ];

  it("merges nails, shellac and vinylux into one Nails group", () => {
    const groups = groupServicesByCategory(services);
    const nails = groups.find((g) => g.slug === "nails");
    expect(nails?.label).toBe("Nails");
    expect(nails?.services.map((s) => s.id)).toEqual(["3", "4", "5"]);
  });

  it("keeps threading, waxing, lash-lift, eyelash-extensions and patch-test as their own groups", () => {
    const groups = groupServicesByCategory(services);
    const slugs = groups.map((g) => g.slug);
    expect(slugs).toEqual(
      expect.arrayContaining(["threading", "waxing", "nails", "lash-lift", "eyelash-extensions", "patch-test"])
    );
    expect(groups.find((g) => g.slug === "threading")?.services).toHaveLength(1);
  });

  it("omits groups with no matching services", () => {
    const groups = groupServicesByCategory([{ id: "1", category_slug: "threading" }]);
    expect(groups.map((g) => g.slug)).toEqual(["threading"]);
  });

  it("gives a head treatment added in admin its own named group instead of dropping it", () => {
    const groups = groupServicesByCategory([{ id: "1", category_slug: "henna-brow" }]);
    expect(groups).toEqual([{ slug: "henna-brow", label: "Henna brow", services: [{ id: "1", category_slug: "henna-brow" }] }]);
  });

  it("lists new head treatments after the known ones", () => {
    const groups = groupServicesByCategory([
      { id: "1", category_slug: "tinting" },
      { id: "2", category_slug: "threading" },
    ]);
    expect(groups.map((g) => g.slug)).toEqual(["threading", "tinting"]);
  });
});

describe("isOnlineBookable", () => {
  it("needs a duration and must not be walk-in only", () => {
    expect(isOnlineBookable({ duration_minutes: 15, booking_mode: "both" })).toBe(true);
    expect(isOnlineBookable({ duration_minutes: 15, booking_mode: "bookable_only" })).toBe(true);
    expect(isOnlineBookable({ duration_minutes: 15 })).toBe(true);
    expect(isOnlineBookable({ duration_minutes: 15, booking_mode: "walk_in_only" })).toBe(false);
    expect(isOnlineBookable({ duration_minutes: null, booking_mode: "both" })).toBe(false);
  });
});
