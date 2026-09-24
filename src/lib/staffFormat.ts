// Pure helpers for the staff admin screens (unit-tested in staffFormat.test.ts).

/** Monday-first display order; values are day_of_week (0 = Sunday). */
export const WEEK_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** "eyelash-extensions" -> "Eyelash extensions". */
export function categoryLabel(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  if (!words) return "Other";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Brows & Lashes" -> "brows-lashes". */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "12", "12.5", "£12.50" -> 1250 pence. null when not a valid amount. */
export function parsePriceToPence(input: string): number | null {
  const cleaned = input.replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export function penceToInput(pence: number): string {
  return (pence / 100).toFixed(2);
}

/** "09:00:00" -> "09:00" (value for <input type="time">). */
export function toTimeInput(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

/** "09:00:00" -> "9:00", "17:30" -> "17:30". */
export function shortTime(value: string | null | undefined): string {
  if (!value) return "";
  const [h, m] = value.split(":");
  return `${parseInt(h, 10)}:${m}`;
}

/** Short tag for a location in dense grids: "Bon Accord Centre" -> "BA", "Location 2" -> "L2". */
export function locationTag(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const significant = parts.filter((p) => !/^(centre|center|salon|the|shop)$/i.test(p));
  const use = significant.length > 0 ? significant : parts;
  return use
    .slice(0, 2)
    .map((p) => (/^\d+$/.test(p) ? p : p.charAt(0).toUpperCase()))
    .join("");
}

/** Monday of the week containing isoDate (London calendar date). */
export function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** "2026-10-20" -> "Tue 20 Oct". */
export function shortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export const STAFF_COLOURS = [
  "#1b8580",
  "#2f6fb5",
  "#6d52bd",
  "#bb3f7a",
  "#cc5a49",
  "#c17f12",
  "#6b7d1f",
  "#2f8a4a",
  "#8a5a2b",
  "#4f6475",
  "#8e3d8c",
  "#054a76",
] as const;

/** First palette colour not already used by another staff member. */
export function nextFreeColour(used: (string | null)[]): string {
  const taken = new Set(used.filter(Boolean).map((c) => (c as string).toLowerCase()));
  return STAFF_COLOURS.find((c) => !taken.has(c)) ?? STAFF_COLOURS[used.length % STAFF_COLOURS.length];
}
