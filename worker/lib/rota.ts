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
