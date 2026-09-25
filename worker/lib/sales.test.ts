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

import { summariseSales, type SaleForSummary } from "./sales";

describe("summariseSales", () => {
  const sale = (o: Partial<SaleForSummary>): SaleForSummary => ({
    total_amount: 1000,
    discount_amount: 0,
    payment_method: "card",
    voided_at: null,
    price_adjusted: false,
    sale_items: [{ staff_member_id: "raisha", line_total_amount: 1000 }],
    ...o,
  });

  it("totals by payment method and staff, discounts off the bill not the person", () => {
    const s = summariseSales([
      sale({ total_amount: 3500, discount_amount: 500, price_adjusted: true, sale_items: [{ staff_member_id: "oslina", line_total_amount: 4000 }] }),
      sale({ payment_method: "cash", total_amount: 300, sale_items: [{ staff_member_id: "raisha", line_total_amount: 300 }] }),
    ]);
    expect(s.count).toBe(2);
    expect(s.total).toBe(3800);
    expect(s.by_method).toEqual({ cash: 300, card: 3500, voucher: 0, other: 0 });
    expect(s.discounts).toBe(500);
    expect(s.adjusted_count).toBe(1);
    expect(s.by_staff).toEqual([
      { staff_member_id: "oslina", amount: 4000, items: 1 },
      { staff_member_id: "raisha", amount: 300, items: 1 },
    ]);
  });

  it("keeps voided sales out of takings but reports them", () => {
    const s = summariseSales([sale({}), sale({ voided_at: "2026-09-25T12:00:00Z", total_amount: 2500 })]);
    expect(s.total).toBe(1000);
    expect(s.by_method.card).toBe(1000);
    expect(s.voided).toEqual({ count: 1, amount: 2500 });
    expect(s.by_staff).toEqual([{ staff_member_id: "raisha", amount: 1000, items: 1 }]);
  });
});
