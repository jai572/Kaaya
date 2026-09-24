// Pure calendar helpers (unit-tested in calendarLayout.test.ts). The salon
// runs on London wall-clock time; appointments are stored as UTC instants.

const TZ = "Europe/London";
const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function londonParts(ms: number) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

/** London calendar date + minutes since midnight for a UTC instant. */
export function londonDayMinutes(iso: string): { date: string; minutes: number } {
  const p = londonParts(Date.parse(iso));
  const date = `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  return { date, minutes: p.h * 60 + p.mi };
}

export function londonToday(): string {
  return londonDayMinutes(new Date().toISOString()).date;
}

/** "2026-10-05" + "10:30" London -> UTC ISO instant (handles BST). */
export function londonWallToIso(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms: number) => {
    const p = londonParts(ms);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - ms;
  };
  let guess = wall - offsetAt(wall);
  guess = wall - offsetAt(guess);
  return new Date(guess).toISOString();
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** 540 -> "9 am", 780 -> "1 pm", 750 -> "12:30 pm". */
export function hourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}

/** "10:05" style clock time for an instant, London. */
export function clockTime(iso: string): string {
  return minutesToTime(londonDayMinutes(iso).minutes);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Monday of the week containing isoDate. */
export function weekStart(isoDate: string): string {
  const dow = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return addDays(isoDate, -((dow + 6) % 7));
}

export function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

export interface LaneItem {
  id: string;
  start: number;
  end: number;
}

/** Side-by-side placement for overlapping items in one column: each item
 * gets a lane, and every item in an overlapping cluster shares the cluster's
 * lane count so widths line up. */
export function layoutLanes(items: LaneItem[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };
  for (const it of sorted) {
    if (it.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    cluster.push({ id: it.id, lane });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

/** Visible time window: opening hours across the shown days, stretched to
 * fit anything booked outside them, on whole hours. Defaults to 9-6. */
export function visibleWindow(
  opening: { open: number; close: number }[],
  items: { start: number; end: number }[]
): { start: number; end: number } {
  const starts = [...opening.map((o) => o.open), ...items.map((i) => i.start)];
  const ends = [...opening.map((o) => o.close), ...items.map((i) => i.end)];
  const start = starts.length ? Math.min(...starts) : 9 * 60;
  const end = ends.length ? Math.max(...ends) : 18 * 60;
  return { start: Math.max(0, Math.floor(start / 60) * 60), end: Math.min(24 * 60, Math.ceil(end / 60) * 60) };
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
