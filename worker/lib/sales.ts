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
