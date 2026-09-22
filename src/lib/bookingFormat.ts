// Pure formatting/filtering helpers shared between the booking wizard and
// confirmation page, kept separate from API calls so they're trivially
// unit-testable.

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null || !currency) return "Price on request";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount / 100);
}

export function formatDuration(minutes: number | null): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// "Any available staff member" shows every fetched slot; a specific one
// filters the same already-fetched slots client-side, no extra round trip.
export function filterSlotsByStaffMember<T extends { staffMemberId: string }>(
  slots: T[],
  staffMemberId: string | null
): T[] {
  return staffMemberId ? slots.filter((s) => s.staffMemberId === staffMemberId) : slots;
}
