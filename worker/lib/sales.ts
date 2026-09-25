// Pure sale arithmetic (unit-tested in sales.test.ts). Amounts are pence.

export interface SaleLine {
  quantity: number;
  unit_price_amount: number;
}

export function saleTotals(
  lines: SaleLine[],
  discount: number
): { subtotal: number; discount: number; total: number } | { error: string } {
  const subtotal = lines.reduce((n, l) => n + l.quantity * l.unit_price_amount, 0);
  if (discount < 0) return { error: "Discount can't be negative" };
  if (discount > subtotal) return { error: "Discount can't be more than the total" };
  return { subtotal, discount, total: subtotal - discount };
}

export type PaymentMethod = "cash" | "card" | "voucher" | "other";

export interface SaleForSummary {
  total_amount: number;
  discount_amount: number;
  payment_method: PaymentMethod;
  voided_at: string | null;
  price_adjusted: boolean;
  sale_items: { staff_member_id: string | null; line_total_amount: number }[];
}

export interface SalesSummary {
  count: number;
  total: number;
  by_method: Record<PaymentMethod, number>;
  discounts: number;
  adjusted_count: number;
  voided: { count: number; amount: number };
  /** Takings per staff member, before discounts (a discount is on the bill, not a person). */
  by_staff: { staff_member_id: string | null; amount: number; items: number }[];
}

/** Day totals. Voided sales are counted separately and never in takings. */
export function summariseSales(sales: SaleForSummary[]): SalesSummary {
  const live = sales.filter((s) => !s.voided_at);
  const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, voucher: 0, other: 0 };
  const byStaff = new Map<string | null, { amount: number; items: number }>();
  for (const s of live) {
    byMethod[s.payment_method] += s.total_amount;
    for (const i of s.sale_items) {
      const row = byStaff.get(i.staff_member_id) ?? { amount: 0, items: 0 };
      row.amount += i.line_total_amount;
      row.items += 1;
      byStaff.set(i.staff_member_id, row);
    }
  }
  const voided = sales.filter((s) => s.voided_at);
  return {
    count: live.length,
    total: live.reduce((n, s) => n + s.total_amount, 0),
    by_method: byMethod,
    discounts: live.reduce((n, s) => n + s.discount_amount, 0),
    adjusted_count: live.filter((s) => s.price_adjusted).length,
    voided: { count: voided.length, amount: voided.reduce((n, s) => n + s.total_amount, 0) },
    by_staff: [...byStaff.entries()]
      .map(([staff_member_id, v]) => ({ staff_member_id, ...v }))
      .sort((a, b) => b.amount - a.amount),
  };
}
