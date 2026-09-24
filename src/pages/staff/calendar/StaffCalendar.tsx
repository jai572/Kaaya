import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  staffGetCalendar,
  staffListBookingServices,
  staffListLocations,
  staffListServiceStaffLinks,
  type BookableService,
  type CalendarAppointment,
  type CalendarBlock,
  type CalendarData,
  type LocationRow,
} from "../../../lib/api";
import {
  addDays,
  clockTime,
  dayOfWeek,
  londonDayMinutes,
  londonToday,
  minutesToTime,
  timeToMinutes,
  visibleWindow,
  weekStart,
} from "../../../lib/calendarLayout";
import { shortDate } from "../../../lib/staffFormat";
import { Segmented, errorMessage } from "../../../components/staff/ui";
import TimeGrid, { type GridColumn } from "./TimeGrid";
import ListView from "./ListView";
import AppointmentPanel from "./AppointmentPanel";
import NewAppointmentDrawer, { type NewAppointmentPrefill } from "./NewAppointmentDrawer";
import { BlockPanel, NewBlockDrawer } from "./BlockDrawers";
import ViewDrawer from "./ViewDrawer";
import { loadPrefs, savePrefs, statusVisible, staffColour, type CalendarPrefs, type CalendarView } from "./shared";

type Open =
  | { kind: "appt"; id: string }
  | { kind: "block"; block: CalendarBlock }
  | { kind: "new"; prefill: NewAppointmentPrefill }
  | { kind: "newBlock"; prefill: { date: string; time: string; staffId: string | null } }
  | { kind: "view" }
  | null;

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "list", label: "List" },
];

function rangeFor(view: CalendarView, date: string): [string, string] {
  if (view === "day") return [date, date];
  if (view === "week") {
    const mon = weekStart(date);
    return [mon, addDays(mon, 6)];
  }
  return [date, addDays(date, 6)];
}

function rangeLabel(view: CalendarView, from: string, to: string): string {
  if (view === "day") {
    return new Date(`${from}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  }
  return `${shortDate(from)} – ${shortDate(to)}`;
}

export default function StaffCalendar() {
  const [params, setParams] = useSearchParams();
  const today = londonToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? (params.get("date") as string) : today;
  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });

  const [prefs, setPrefs] = useState<CalendarPrefs>(loadPrefs);
  const updatePrefs = useCallback((patch: Partial<CalendarPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const [locations, setLocations] = useState<LocationRow[] | null>(null);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<BookableService[]>([]);
  const [links, setLinks] = useState<{ service_id: string; staff_member_id: string }[]>([]);
  const [open, setOpen] = useState<Open>(null);

  useEffect(() => {
    staffListLocations()
      .then(({ locations }) => setLocations(locations.filter((l) => l.active)))
      .catch((e) => setError(errorMessage(e, "Could not load locations")));
    Promise.all([staffListBookingServices(), staffListServiceStaffLinks()])
      .then(([s, l]) => {
        setServices(s.services);
        setLinks(l.links);
      })
      .catch(() => undefined); // only needed for booking; the drawer explains if empty
  }, []);

  const locationId = useMemo(() => {
    if (!locations || locations.length === 0) return null;
    if (prefs.locationId && locations.some((l) => l.id === prefs.locationId)) return prefs.locationId;
    return (locations.find((l) => l.hours.length > 0) ?? locations[0]).id;
  }, [locations, prefs.locationId]);

  const [from, to] = rangeFor(prefs.view, date);

  const load = useCallback(() => {
    if (!locationId) return;
    setLoading(true);
    staffGetCalendar(locationId, from, to)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e, "Could not load the calendar")))
      .finally(() => setLoading(false));
  }, [locationId, from, to]);

  useEffect(load, [load]);

  const fresh = data && data.location.id === locationId && data.dates[0] === from ? data : null;
  const visibleAppts = useMemo(() => (fresh ? fresh.appointments.filter((a) => statusVisible(a.status, prefs)) : []), [fresh, prefs]);
  const staffById = useMemo(() => new Map((fresh?.staff ?? []).map((s) => [s.id, s])), [fresh]);

  // Who gets a column when "whoever is working" is on: on the rota here, or booked/blocked here.
  const autoStaffIds = useMemo(() => {
    if (!fresh) return [];
    const busy = new Set([...visibleAppts.map((a) => a.staff_member_id), ...fresh.blocks.map((b) => b.staff_member_id)]);
    const dates = prefs.view === "day" ? [date] : fresh.dates;
    const ids = fresh.staff.filter((s) => s.active && (busy.has(s.id) || dates.some((d) => fresh.shifts[s.id]?.[d]))).map((s) => s.id);
    return ids.length ? ids : fresh.staff.filter((s) => s.active).map((s) => s.id);
  }, [fresh, visibleAppts, prefs.view, date]);

  const shownStaffIds = useMemo(() => {
    if (!fresh) return [];
    if (!fresh.can_view_all) return fresh.own_staff_member_id ? [fresh.own_staff_member_id] : [];
    const chosen = prefs.staffIds === null ? autoStaffIds : prefs.staffIds.filter((id) => staffById.has(id));
    return chosen.length ? chosen : autoStaffIds;
  }, [fresh, prefs.staffIds, autoStaffIds, staffById]);

  const weekStaffId = useMemo(() => {
    if (!fresh) return null;
    if (!fresh.can_view_all) return fresh.own_staff_member_id;
    if (prefs.weekStaffId && staffById.has(prefs.weekStaffId)) return prefs.weekStaffId;
    return fresh.own_staff_member_id && staffById.has(fresh.own_staff_member_id) ? fresh.own_staff_member_id : autoStaffIds[0] ?? null;
  }, [fresh, prefs.weekStaffId, staffById, autoStaffIds]);

  const columns: GridColumn[] = useMemo(() => {
    if (!fresh) return [];
    const onDate = (iso: string, d: string) => londonDayMinutes(iso).date === d;
    const make = (staffId: string, d: string, title: string, withColour: boolean): GridColumn => {
      const shift = fresh.shifts[staffId]?.[d] ?? null;
      return {
        key: `${staffId}:${d}`,
        title,
        subtitle: shift ? `${shift.startTime}–${shift.endTime}` : "Not on the rota",
        colour: withColour ? staffColour(staffById.get(staffId)?.colour) : null,
        date: d,
        staffId,
        shift,
        appointments: visibleAppts.filter((a) => a.staff_member_id === staffId && onDate(a.scheduled_at, d)),
        blocks: fresh.blocks.filter((b) => b.staff_member_id === staffId && onDate(b.start_at, d)),
        isToday: d === today,
      };
    };
    if (prefs.view === "day") return shownStaffIds.map((id) => make(id, date, staffById.get(id)?.display_name ?? "?", true));
    if (prefs.view === "week" && weekStaffId) return fresh.dates.map((d) => make(weekStaffId, d, shortDate(d), false));
    return [];
  }, [fresh, prefs.view, shownStaffIds, weekStaffId, date, visibleAppts, staffById, today]);

  const gridWindow = useMemo(() => {
    const opening = (fresh?.location.hours ?? [])
      .filter((h) => columns.some((c) => dayOfWeek(c.date) === h.day_of_week))
      .map((h) => ({ open: timeToMinutes(h.open_time), close: timeToMinutes(h.close_time) }));
    const items = columns.flatMap((c) => [
      ...c.appointments.map((a) => {
        const s = londonDayMinutes(a.scheduled_at).minutes;
        return { start: s, end: s + Math.round((Date.parse(a.end_at) - Date.parse(a.scheduled_at)) / 60000) };
      }),
      ...c.blocks.map((b) => {
        const s = londonDayMinutes(b.start_at).minutes;
        return { start: s, end: s + Math.round((Date.parse(b.end_at) - Date.parse(b.start_at)) / 60000) };
      }),
    ]);
    return visibleWindow(opening, items);
  }, [fresh, columns]);

  const pendingCount = (fresh?.appointments ?? []).filter((a) => a.status === "pending_approval" && Date.parse(a.scheduled_at) > Date.now()).length;
  const openAppt = open?.kind === "appt" ? fresh?.appointments.find((a) => a.id === open.id) ?? null : null;
  const step = prefs.view === "day" ? 1 : 7;

  function defaultStart(): string {
    const now = londonDayMinutes(new Date().toISOString()).minutes;
    return date === today ? minutesToTime(Math.min(23 * 60, Math.ceil(now / 15) * 15)) : minutesToTime(gridWindow.start);
  }

  function afterChange() {
    setOpen(null);
    load();
  }

  function bookNext(a: CalendarAppointment) {
    const other = shownStaffIds.find((id) => id !== a.staff_member_id) ?? a.staff_member_id;
    setOpen({
      kind: "new",
      prefill: {
        date: londonDayMinutes(a.end_at).date,
        time: clockTime(a.end_at),
        staffId: other,
        client: a.clients ? { id: a.client_id, ...a.clients } : null,
        linkAppointmentId: a.id,
      },
    });
  }

  return (
    <div className="st-page st-page--wide st-cal-page">
      <div className="st-cal-toolbar">
        <div className="st-cal-toolbar-group">
          {locations && locations.length > 1 && (
            <select
              className="st-select st-cal-loc"
              aria-label="Location"
              value={locationId ?? ""}
              onChange={(e) => updatePrefs({ locationId: e.target.value })}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <div className="st-cal-nav">
            <button type="button" className="st-btn st-btn--ghost st-btn--sm" aria-label="Previous" onClick={() => setDate(addDays(date, -step))}>
              ‹
            </button>
            <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={() => setDate(today)} disabled={date === today}>
              Today
            </button>
            <button type="button" className="st-btn st-btn--ghost st-btn--sm" aria-label="Next" onClick={() => setDate(addDays(date, step))}>
              ›
            </button>
          </div>
          <label className="st-cal-date">
            <span>{rangeLabel(prefs.view, from, to)}</span>
            <input
              type="date"
              aria-label="Go to date"
              value={date}
              onClick={(e) => {
                try {
                  (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                } catch {
                  // older browsers: the native control still works
                }
              }}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </label>
          {loading && <span className="st-hint">Loading…</span>}
        </div>
        <div className="st-cal-toolbar-group">
          {pendingCount > 0 && (
            <Link to="/staff/bookings" className="st-chip st-chip--warn st-cal-pending">
              {pendingCount} to approve
            </Link>
          )}
          <Segmented label="Calendar view" value={prefs.view} options={VIEWS} onChange={(view) => updatePrefs({ view })} />
          <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={() => setOpen({ kind: "view" })}>
            View
          </button>
          <button
            type="button"
            className="st-btn st-btn--ghost st-btn--sm"
            disabled={!fresh}
            onClick={() => setOpen({ kind: "newBlock", prefill: { date, time: defaultStart(), staffId: prefs.view === "week" ? weekStaffId : shownStaffIds[0] ?? null } })}
          >
            Block time
          </button>
          <button
            type="button"
            className="st-btn st-btn--sm"
            disabled={!fresh}
            onClick={() => setOpen({ kind: "new", prefill: { date, time: defaultStart(), staffId: prefs.view === "week" ? weekStaffId : shownStaffIds[0] ?? null } })}
          >
            + Appointment
          </button>
        </div>
      </div>

      {error && <p className="st-error">{error}</p>}
      {locations && locations.length === 0 && <p className="st-note">Add a location in Setup → Locations first.</p>}

      {fresh && prefs.view !== "list" && columns.length > 0 && (
        <TimeGrid
          columns={columns}
          minColumnWidth={prefs.view === "week" ? 104 : 148}
          window={gridWindow}
          colourFor={(id) => staffColour(staffById.get(id)?.colour)}
          onOpenAppointment={(a) => setOpen({ kind: "appt", id: a.id })}
          onOpenBlock={(b) => setOpen({ kind: "block", block: b })}
          onEmptyClick={(col, minutes) => setOpen({ kind: "new", prefill: { date: col.date, time: minutesToTime(minutes), staffId: col.staffId } })}
        />
      )}
      {fresh && prefs.view !== "list" && columns.length === 0 && <p className="st-empty">No staff to show. Add staff in Setup → Staff.</p>}
      {fresh && prefs.view === "list" && (
        <ListView
          data={fresh}
          appointments={visibleAppts}
          blocks={fresh.blocks}
          staffIds={new Set(shownStaffIds)}
          onOpenAppointment={(a) => setOpen({ kind: "appt", id: a.id })}
          onOpenBlock={(b) => setOpen({ kind: "block", block: b })}
        />
      )}

      {open?.kind === "appt" && openAppt && fresh && (
        <AppointmentPanel
          key={openAppt.id}
          appointment={openAppt}
          data={fresh}
          onClose={() => setOpen(null)}
          onChanged={afterChange}
          onOpenOther={(a) => setOpen({ kind: "appt", id: a.id })}
          onBookNext={bookNext}
        />
      )}
      {open?.kind === "block" && fresh && <BlockPanel block={open.block} data={fresh} onClose={() => setOpen(null)} onDeleted={afterChange} />}
      {open?.kind === "new" && fresh && (
        <NewAppointmentDrawer data={fresh} services={services} links={links} prefill={open.prefill} onClose={() => setOpen(null)} onBooked={afterChange} />
      )}
      {open?.kind === "newBlock" && fresh && <NewBlockDrawer data={fresh} prefill={open.prefill} onClose={() => setOpen(null)} onSaved={afterChange} />}
      {open?.kind === "view" && (
        <ViewDrawer prefs={prefs} data={fresh} autoStaffIds={autoStaffIds} onChange={updatePrefs} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
