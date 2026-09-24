// Pure calendar logic (no I/O), unit-tested in calendar.test.ts.
import { londonDateIso, londonWallTimeToUtcIso, toDayOfWeek } from "./availability";
import { effectiveShift, type RotaExceptionLike, type ShiftLike } from "./rota";

export type Shift = { startTime: string; endTime: string };

/** Each staff member's shift at one location for every date in a range:
 * staffId -> date -> shift (null = not working here that day). */
export function shiftsForRange(params: {
  locationId: string;
  dates: string[];
  staffIds: string[];
  regular: (ShiftLike & { staff_member_id: string; day_of_week: number })[];
  exceptions: (RotaExceptionLike & { staff_member_id: string })[];
  opening: { day_of_week: number; open_time: string; close_time: string }[];
}): Record<string, Record<string, Shift | null>> {
  const { locationId, dates, staffIds, regular, exceptions, opening } = params;
  const out: Record<string, Record<string, Shift | null>> = {};
  for (const staffId of staffIds) {
    out[staffId] = {};
    for (const date of dates) {
      const dow = toDayOfWeek(date);
      out[staffId][date] = effectiveShift({
        locationId,
        regular: regular.find((r) => r.staff_member_id === staffId && r.day_of_week === dow) ?? null,
        exception: exceptions.find((e) => e.staff_member_id === staffId && e.date === date) ?? null,
        opening: opening.find((o) => o.day_of_week === dow) ?? null,
      });
    }
  }
  return out;
}

export interface Interval {
  start_at: string;
  end_at: string;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return Date.parse(a.start_at) < Date.parse(b.end_at) && Date.parse(b.start_at) < Date.parse(a.end_at);
}

/** Heads-ups for a staff booking. Staff can book any time (business rule),
 * so these never block -- they're shown once for the person to confirm. */
export function staffBookingWarnings(params: {
  staffName: string;
  start_at: string;
  end_at: string;
  shift: Shift | null;
  blocks: Interval[];
  nowIso?: string;
}): string[] {
  const { staffName, start_at, end_at, shift, blocks, nowIso } = params;
  const warnings: string[] = [];
  const date = londonDateIso(start_at);
  if (!shift) {
    warnings.push(`${staffName} isn't on the rota here that day.`);
  } else {
    const from = Date.parse(londonWallTimeToUtcIso(date, shift.startTime));
    const to = Date.parse(londonWallTimeToUtcIso(date, shift.endTime));
    if (Date.parse(start_at) < from || Date.parse(end_at) > to) {
      warnings.push(`Outside ${staffName}'s hours (${shift.startTime}–${shift.endTime}).`);
    }
  }
  if (blocks.some((b) => overlaps(b, { start_at, end_at }))) warnings.push(`Overlaps ${staffName}'s blocked time.`);
  if (Date.parse(start_at) < (nowIso ? Date.parse(nowIso) : Date.now())) warnings.push("That time has already passed.");
  return warnings;
}

/** Keeps only characters that can appear in a name, phone or email, so the
 * text can't break out of the PostgREST or() filter or add ilike wildcards. */
export function sanitiseSearch(q: string): string {
  return q
    .replace(/[^\p{L}\p{N} @.+'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
