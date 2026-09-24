import type { AppointmentStatus, BlockReason, CalendarAppointment } from "../../../lib/api";

export const BLOCK_LABEL: Record<BlockReason, string> = {
  break: "Break",
  lunch: "Lunch",
  personal: "Personal",
  training: "Training",
  other: "Blocked",
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending_approval: "Pending approval",
  confirmed: "Confirmed",
  completed: "Completed",
  no_show: "No-show",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

export const STATUS_CHIP: Record<AppointmentStatus, string> = {
  pending_approval: "st-chip st-chip--warn",
  confirmed: "st-chip st-chip--acc",
  completed: "st-chip st-chip--ok",
  no_show: "st-chip st-chip--bad",
  cancelled: "st-chip",
  rescheduled: "st-chip",
};

const FALLBACK_COLOUR = "#4f6475";

export function staffColour(colour: string | null | undefined): string {
  return colour && /^#[0-9a-f]{6}$/i.test(colour) ? colour : FALLBACK_COLOUR;
}

export function apptTitle(a: CalendarAppointment): string {
  if (!a.clients) return "Client";
  return `${a.clients.first_name} ${a.clients.last_name}`.trim();
}

export function money(pence: number): string {
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
}

export type CalendarView = "day" | "week" | "list";

export interface CalendarPrefs {
  view: CalendarView;
  locationId: string | null;
  staffIds: string[] | null; // null = whoever is working
  weekStaffId: string | null;
  showConfirmed: boolean;
  showPending: boolean;
  showCancelled: boolean;
}

const PREFS_KEY = "kaaya.staff.calendar.v1";

export function loadPrefs(): CalendarPrefs {
  const defaults: CalendarPrefs = {
    view: typeof window !== "undefined" && window.innerWidth < 700 ? "list" : "day",
    locationId: null,
    staffIds: null,
    weekStaffId: null,
    showConfirmed: true,
    showPending: true,
    showCancelled: false,
  };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<CalendarPrefs>) } : defaults;
  } catch {
    return defaults;
  }
}

export function savePrefs(prefs: CalendarPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // private mode / storage blocked: the calendar still works, it just won't remember
  }
}

export function statusVisible(status: AppointmentStatus, prefs: CalendarPrefs): boolean {
  if (status === "rescheduled") return false;
  if (status === "cancelled") return prefs.showCancelled;
  if (status === "pending_approval") return prefs.showPending;
  return prefs.showConfirmed;
}
