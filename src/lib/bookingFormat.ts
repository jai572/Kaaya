import { categoryLabel } from "./staffFormat";

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

// Booking Step 1's category cards. Grouped by the services table's real
// category_slug values (confirmed live: threading, waxing, nails, shellac,
// vinylux, lash-lift, eyelash-extensions, patch-test) -- not the leaflet's
// old categories, which include a "Tinting" bucket with no real catalog
// items behind it any more. Nails/shellac/vinylux merge into one "Nails"
// card per business decision; every other DB category_slug gets its own.
export type BookingCategoryGroup = {
  slug: string;
  label: string;
};

export const BOOKING_CATEGORY_GROUPS: BookingCategoryGroup[] = [
  { slug: "threading", label: "Threading" },
  { slug: "waxing", label: "Waxing" },
  { slug: "nails", label: "Nails" },
  { slug: "lash-lift", label: "Lash Lift & Curl" },
  { slug: "eyelash-extensions", label: "Eyelash Extensions" },
  { slug: "patch-test", label: "Patch Test" },
];

// Which raw category_slug values fold into which card. Anything not listed
// here falls into a catch-all "Other" card rather than silently vanishing
// from the booking flow if a new category is ever added in Staff > Services.
const CATEGORY_SLUG_MAP: Record<string, string> = {
  threading: "threading",
  waxing: "waxing",
  nails: "nails",
  shellac: "nails",
  vinylux: "nails",
  "lash-lift": "lash-lift",
  "eyelash-extensions": "eyelash-extensions",
  "patch-test": "patch-test",
};

export function groupServicesByCategory<T extends { category_slug: string }>(
  services: T[]
): { slug: string; label: string; services: T[] }[] {
  const bySlug = new Map<string, T[]>();
  for (const service of services) {
    // Known slugs keep the agreed grouping; a head treatment added later in
    // admin gets its own group rather than disappearing into "Other".
    const groupSlug = CATEGORY_SLUG_MAP[service.category_slug] ?? service.category_slug;
    const existing = bySlug.get(groupSlug);
    if (existing) existing.push(service);
    else bySlug.set(groupSlug, [service]);
  }

  const known = new Set(BOOKING_CATEGORY_GROUPS.map((g) => g.slug));
  const groups = BOOKING_CATEGORY_GROUPS.filter((g) => bySlug.has(g.slug)).map((g) => ({
    ...g,
    services: bySlug.get(g.slug)!,
  }));

  const added = [...bySlug.keys()].filter((slug) => !known.has(slug)).sort();
  for (const slug of added) groups.push({ slug, label: categoryLabel(slug), services: bySlug.get(slug)! });

  return groups;
}

/** Whether a client can pick this treatment online: it needs a duration and
 * must not be walk-in only. Walk-in-only ones still show, tagged. */
export function isOnlineBookable(service: { duration_minutes: number | null; booking_mode?: string }): boolean {
  return !!service.duration_minutes && service.booking_mode !== "walk_in_only";
}
