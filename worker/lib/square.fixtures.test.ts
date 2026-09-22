import { describe, it, expect } from "vitest";
import { createMockSquareClient } from "./square.fixtures";

describe("mock Square client", () => {
  it("lists the fixture bookable services", async () => {
    const client = createMockSquareClient();
    const services = await client.listBookableServices();
    expect(services.length).toBeGreaterThan(0);
    expect(services.every((s) => s.squareVariationId)).toBe(true);
  });

  it("filters team members to only those who can perform the given service", async () => {
    const client = createMockSquareClient();
    const all = await client.listTeamMembers();
    const restricted = await client.listTeamMembers("fixture-variation-tint-eyelash");
    expect(restricted.length).toBeLessThan(all.length);
    expect(restricted.every((m) => m.id === "fixture-team-nina")).toBe(true);
  });

  it("returns availability only for the requested variation and team member", async () => {
    const client = createMockSquareClient();
    const slots = await client.searchAvailability({
      serviceVariationId: "fixture-variation-tint-eyebrow",
      date: "2026-01-01",
      teamMemberId: "fixture-team-nina",
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.teamMemberId === "fixture-team-nina")).toBe(true);
    expect(slots.every((s) => s.serviceVariationId === "fixture-variation-tint-eyebrow")).toBe(true);
    expect(slots.every((s) => s.startAt.startsWith("2026-01-01"))).toBe(true);
  });

  it("returns no availability for an unknown variation", async () => {
    const client = createMockSquareClient();
    const slots = await client.searchAvailability({ serviceVariationId: "does-not-exist", date: "2026-01-01" });
    expect(slots).toEqual([]);
  });

  it("finds the fixture returning customer by email, case-insensitively", async () => {
    const client = createMockSquareClient();
    const found = await client.searchCustomerByEmail("Returning.Customer@example.com");
    expect(found?.id).toBe("fixture-customer-1");
  });

  it("returns null when no fixture customer matches", async () => {
    const client = createMockSquareClient();
    const found = await client.searchCustomerByEmail("nobody@example.com");
    expect(found).toBeNull();
  });

  it("creates a new customer with a unique id each time", async () => {
    const client = createMockSquareClient();
    const a = await client.createCustomer({
      givenName: "A",
      familyName: "B",
      emailAddress: "a@example.com",
      phoneNumber: "+447700900000",
    });
    const b = await client.createCustomer({
      givenName: "C",
      familyName: "D",
      emailAddress: "c@example.com",
      phoneNumber: "+447700900001",
    });
    expect(a.id).not.toBe(b.id);
  });
});
