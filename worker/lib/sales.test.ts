import { describe, it, expect } from "vitest";
import { saleTotals } from "./sales";

describe("saleTotals", () => {
  it("adds lines and takes off the discount", () => {
    expect(saleTotals([{ quantity: 1, unit_price_amount: 3300 }, { quantity: 2, unit_price_amount: 300 }], 500)).toEqual({
      subtotal: 3900,
      discount: 500,
      total: 3400,
    });
  });
  it("allows a free sale (e.g. patch test)", () => {
    expect(saleTotals([{ quantity: 1, unit_price_amount: 0 }], 0)).toEqual({ subtotal: 0, discount: 0, total: 0 });
  });
  it("rejects a discount bigger than the bill", () => {
    expect(saleTotals([{ quantity: 1, unit_price_amount: 1000 }], 1001)).toEqual({ error: "Discount can't be more than the total" });
  });
});
