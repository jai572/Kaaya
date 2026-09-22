// Pure availability-computation logic — no I/O. Route handlers in
// worker/routes/booking.ts load the working-hours/booked-interval data from
// Supabase and hand it to these functions; keeping them pure makes them
// unit-testable without a database.

export interface WorkingBlock {
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string;
}

export interface BookedInterval {
  startAt: string; // ISO instant
  endAt: string;
}

export interface Slot {
  startAt: string; // ISO instant
  endAt: string;
}

/** Day of week for a plain "YYYY-MM-DD" calendar date: 0=Sunday..6=Saturday,
 * matching staff_working_hours.day_of_week and JS Date#getDay(). Parsed as
 * UTC midnight so the result never depends on the host machine's timezone —
 * a calendar date's weekday is a fixed fact. */
export function toDayOfWeek(dateIso: string): number {
  return new Date(`${dateIso}T00:00:00Z`).getUTCDay();
}

function londonOffsetMinutesAt(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Resolves a salon-local ("Europe/London") wall-clock date+time to the
 * correct UTC instant, accounting for GMT/BST — getting this wrong means a
 * client shows up at the wrong actual time. */
export function londonWallTimeToUtcIso(dateIso: string, timeHms: string): string {
  const time = timeHms.length === 5 ? `${timeHms}:00` : timeHms;
  const naiveUtc = new Date(`${dateIso}T${time}Z`);
  const offsetMinutes = londonOffsetMinutesAt(naiveUtc);
  return new Date(naiveUtc.getTime() - offsetMinutes * 60000).toISOString();
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function computeAvailableSlots(params: {
  dateIso: string;
  durationMinutes: number;
  workingBlock: WorkingBlock | null;
  bookedIntervals: BookedInterval[];
  slotIntervalMinutes?: number;
  nowIso?: string;
}): Slot[] {
  const { dateIso, durationMinutes, workingBlock, bookedIntervals, slotIntervalMinutes = 15, nowIso } = params;
  if (!workingBlock) return [];

  const blockStart = new Date(londonWallTimeToUtcIso(dateIso, workingBlock.startTime)).getTime();
  const blockEnd = new Date(londonWallTimeToUtcIso(dateIso, workingBlock.endTime)).getTime();
  const now = nowIso ? new Date(nowIso).getTime() : null;
  const booked = bookedIntervals.map((b) => ({ start: new Date(b.startAt).getTime(), end: new Date(b.endAt).getTime() }));

  const slots: Slot[] = [];
  const stepMs = slotIntervalMinutes * 60000;
  const durationMs = durationMinutes * 60000;

  for (let start = blockStart; start + durationMs <= blockEnd; start += stepMs) {
    const end = start + durationMs;
    if (now !== null && start <= now) continue;
    if (booked.some((b) => overlaps(start, end, b.start, b.end))) continue;
    slots.push({ startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() });
  }

  return slots;
}
