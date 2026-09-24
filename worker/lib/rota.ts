// Pure rota logic (no I/O), unit-tested in rota.test.ts. Rota times are
// salon-local wall-clock ("Europe/London"), appointments are UTC instants.
import { londonDateIso, londonWallTimeToUtcIso } from "./availability";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Every calendar date from fromIso to toIso inclusive ("YYYY-MM-DD"). */
export function expandDateRange(fromIso: string, toIso: string): string[] {
  const start = Date.parse(`${fromIso}T00:00:00Z`);
  const end = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
  const dates: string[] = [];
  for (let t = start; t <= end; t += MS_PER_DAY) dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
}

export interface RotaExceptionLike {
  date: string;
  kind: "off" | "working";
  location_id: string | null;
  start_time: string | null;
  end_time: string | null;
}

export interface AppointmentLike {
  scheduled_at: string;
  end_at: string;
  location_id: string | null;
  status: string;
}

const ACTIVE_STATUSES = new Set(["pending_approval", "confirmed"]);

/** Whether an exception leaves this appointment without its staff member:
 * "off" clashes with anything active that day; "working" clashes when the
 * appointment is at another location or outside the new hours. */
export function isAppointmentAffected(exception: RotaExceptionLike, appointment: AppointmentLike): boolean {
  if (!ACTIVE_STATUSES.has(appointment.status)) return false;
  if (londonDateIso(appointment.scheduled_at) !== exception.date) return false;
  if (exception.kind === "off") return true;

  if (appointment.location_id && exception.location_id && appointment.location_id !== exception.location_id) return true;
  if (!exception.start_time || !exception.end_time) return true;

  const windowStart = Date.parse(londonWallTimeToUtcIso(exception.date, exception.start_time));
  const windowEnd = Date.parse(londonWallTimeToUtcIso(exception.date, exception.end_time));
  return Date.parse(appointment.scheduled_at) < windowStart || Date.parse(appointment.end_at) > windowEnd;
}

export interface ShiftLike {
  start_time: string;
  end_time: string;
  location_id: string | null;
}

const hhmm = (t: string) => t.slice(0, 5);

/** The hours a staff member can take online bookings at one location on one
 * date: a dated exception replaces the regular rota for that day, the shift
 * must be at this location, and it's trimmed to the location's opening hours
 * (a closed day means no online slots). null = not bookable that day. */
export function effectiveShift(params: {
  locationId: string;
  regular: ShiftLike | null;
  exception: RotaExceptionLike | null;
  opening: { open_time: string; close_time: string } | null;
}): { startTime: string; endTime: string } | null {
  const { locationId, regular, exception, opening } = params;
  if (!opening) return null;

  let shift: ShiftLike | null = regular;
  if (exception) {
    if (exception.kind === "off") return null;
    shift = exception.start_time && exception.end_time
      ? { start_time: exception.start_time, end_time: exception.end_time, location_id: exception.location_id }
      : null;
  }
  if (!shift || shift.location_id !== locationId) return null;

  const start = [hhmm(shift.start_time), hhmm(opening.open_time)].sort()[1];
  const end = [hhmm(shift.end_time), hhmm(opening.close_time)].sort()[0];
  return end > start ? { startTime: start, endTime: end } : null;
}

/** Whether a client may book this date online: not in the past, and no more
 * than windowDays after today (both London calendar dates). */
export function isWithinBookingWindow(dateIso: string, todayIso: string, windowDays: number): boolean {
  if (dateIso < todayIso) return false;
  const last = new Date(Date.parse(`${todayIso}T00:00:00Z`) + windowDays * 86400000).toISOString().slice(0, 10);
  return dateIso <= last;
}
