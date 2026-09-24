import { useCallback, useEffect, useMemo, useState } from "react";
import {
  staffListStaffMembers,
  staffListLocations,
  staffGetRota,
  staffSetStaffWorkingHours,
  staffListRotaExceptions,
  staffCreateRotaException,
  staffDeleteRotaException,
  type StaffMemberRow,
  type LocationRow,
  type RotaHoursRow,
  type RotaExceptionRow,
  type WorkingHoursBlock,
} from "../../lib/api";
import { todayIso } from "../../lib/bookingFormat";
import { DAY_LONG, DAY_SHORT, WEEK_DISPLAY_ORDER, locationTag, shortDate, shortTime, toTimeInput } from "../../lib/staffFormat";
import { Drawer, PageHead, Segmented, Switch, errorMessage } from "../../components/staff/ui";

type Tab = "regular" | "exceptions";
type Week = Record<number, WorkingHoursBlock>; // keyed by day_of_week

function weekFromRows(rows: RotaHoursRow[]): Week {
  const week: Week = {};
  for (let d = 0; d < 7; d++) week[d] = { day_of_week: d, start_time: null, end_time: null, location_id: null };
  for (const r of rows) {
    week[r.day_of_week] = { day_of_week: r.day_of_week, start_time: toTimeInput(r.start_time), end_time: toTimeInput(r.end_time), location_id: r.location_id };
  }
  return week;
}

export default function StaffRota() {
  const [tab, setTab] = useState<Tab>("regular");
  const [staff, setStaff] = useState<StaffMemberRow[] | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [weeks, setWeeks] = useState<Record<string, Week>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ staffId: string; day: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [st, lc, rt] = await Promise.all([staffListStaffMembers(), staffListLocations(), staffGetRota()]);
      const active = st.staffMembers.filter((m) => m.active);
      setStaff(active);
      setLocations(lc.locations);
      const next: Record<string, Week> = {};
      for (const m of active) next[m.id] = weekFromRows(rt.hours.filter((h) => h.staff_member_id === m.id));
      setWeeks(next);
      setDirty(new Set());
    } catch (e) {
      setError(errorMessage(e, "Could not load the rota"));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const locIndex = useMemo(() => new Map(locations.map((l, i) => [l.id, i])), [locations]);
  const locById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  function setDay(staffId: string, block: WorkingHoursBlock) {
    setWeeks((prev) => ({ ...prev, [staffId]: { ...prev[staffId], [block.day_of_week]: block } }));
    setDirty((prev) => new Set(prev).add(staffId));
    setSavedMsg(null);
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      for (const id of dirty) {
        await staffSetStaffWorkingHours(id, Object.values(weeks[id]));
      }
      const n = dirty.size;
      await load();
      setSavedMsg(`Rota saved for ${n} ${n === 1 ? "person" : "people"}`);
    } catch (e) {
      setError(errorMessage(e, "Could not save the rota"));
    } finally {
      setSaving(false);
    }
  }

  const editingMember = editing ? staff?.find((m) => m.id === editing.staffId) : undefined;

  return (
    <div className="st-page">
      <PageHead title="Rota" subtitle="Each person's regular week, plus holidays and one-off changes. Online booking slots follow the rota; staff can book any time." />

      <div className="st-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "regular"} onClick={() => setTab("regular")}>
          Regular rota
        </button>
        <button type="button" role="tab" aria-selected={tab === "exceptions"} onClick={() => setTab("exceptions")}>
          Holidays &amp; changes
        </button>
      </div>

      {error && <div className="st-error" role="alert">{error}</div>}

      {tab === "regular" && (
        <>
          <div className="st-head">
            <p className="st-muted" style={{ margin: 0 }}>
              Repeats every week. Click a day to change it.
            </p>
            <div className="st-head-actions">
              {savedMsg && <span className="st-saved">{savedMsg}</span>}
              {dirty.size > 0 && (
                <>
                  <span className="st-chip st-chip--warn">Unsaved changes</span>
                  <button type="button" className="st-btn st-btn--ghost" onClick={load} disabled={saving}>
                    Discard
                  </button>
                </>
              )}
              <button type="button" className="st-btn" onClick={saveAll} disabled={saving || dirty.size === 0}>
                {saving ? "Saving…" : "Save rota"}
              </button>
            </div>
          </div>

          <div className="st-card st-table-wrap">
            {staff === null ? (
              <div className="st-empty">Loading…</div>
            ) : staff.length === 0 ? (
              <div className="st-empty">No active staff. Add staff first.</div>
            ) : (
              <table className="st-table st-rota">
                <thead>
                  <tr>
                    <th>Staff</th>
                    {WEEK_DISPLAY_ORDER.map((d) => (
                      <th key={d}>{DAY_SHORT[d]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staff.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                          <span className="st-dot" style={{ ["--dot" as string]: m.colour ?? undefined }} />
                          <b>{m.display_name}</b>
                        </span>
                      </td>
                      {WEEK_DISPLAY_ORDER.map((d) => {
                        const b = weeks[m.id]?.[d];
                        const working = !!(b?.start_time && b?.end_time);
                        const loc = b?.location_id ? locById.get(b.location_id) : undefined;
                        return (
                          <td key={d} className="st-cell">
                            <button
                              type="button"
                              className={`st-cell-btn${dirty.has(m.id) ? " st-dirty" : ""}`}
                              aria-label={`${m.display_name}, ${DAY_LONG[d]}: ${working ? `${loc?.name ?? "no location"} ${b?.start_time} to ${b?.end_time}` : "off"}. Edit`}
                              onClick={() => setEditing({ staffId: m.id, day: d })}
                            >
                              {working ? (
                                <>
                                  <span className={`st-loc st-loc--${(locIndex.get(b!.location_id ?? "") ?? 0) % 4}`}>{loc ? locationTag(loc.name) : "?"}</span>
                                  <span className="st-hours">
                                    {shortTime(b!.start_time)}–{shortTime(b!.end_time)}
                                  </span>
                                </>
                              ) : (
                                <span className="st-cell-off">Off</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {locations.length > 0 && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }} className="st-hint">
              {locations.map((l, i) => (
                <span key={l.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <span className={`st-loc st-loc--${i % 4}`}>{locationTag(l.name)}</span> {l.name}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "exceptions" && staff && <Exceptions staff={staff} locations={locations} />}

      {editing && editingMember && (
        <DayEditor
          member={editingMember}
          day={editing.day}
          block={weeks[editing.staffId][editing.day]}
          locations={locations.filter((l) => l.active)}
          onClose={() => setEditing(null)}
          onApply={(blocks) => {
            blocks.forEach((b) => setDay(editing.staffId, b));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function defaultHours(location: LocationRow | undefined, day: number) {
  const h = location?.hours.find((x) => x.day_of_week === day);
  return { start: h ? toTimeInput(h.open_time) : "09:00", end: h ? toTimeInput(h.close_time) : "18:00" };
}

function DayEditor({
  member,
  day,
  block,
  locations,
  onClose,
  onApply,
}: {
  member: StaffMemberRow;
  day: number;
  block: WorkingHoursBlock;
  locations: LocationRow[];
  onClose: () => void;
  onApply: (blocks: WorkingHoursBlock[]) => void;
}) {
  const firstLoc = locations.find((l) => l.id === block.location_id) ?? locations[0];
  const defaults = defaultHours(firstLoc, day);
  // Opening a day is almost always to set it as a working day; "Day off" is one toggle away.
  const [working, setWorking] = useState(true);
  const [locationId, setLocationId] = useState(block.location_id ?? firstLoc?.id ?? "");
  const [start, setStart] = useState(block.start_time || defaults.start);
  const [end, setEnd] = useState(block.end_time || defaults.end);
  const [alsoDays, setAlsoDays] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const loc = locations.find((l) => l.id === locationId);
  const locHours = loc?.hours.find((h) => h.day_of_week === day);
  const outsideOpening = working && loc && (!locHours || start < toTimeInput(locHours.open_time) || end > toTimeInput(locHours.close_time));

  function apply() {
    if (working) {
      if (!locationId) return setErr("Pick a location.");
      if (!start || !end || end <= start) return setErr("End time must be after start time.");
    }
    const make = (d: number): WorkingHoursBlock =>
      working ? { day_of_week: d, start_time: start, end_time: end, location_id: locationId } : { day_of_week: d, start_time: null, end_time: null, location_id: null };
    onApply([make(day), ...alsoDays.map(make)]);
  }

  return (
    <Drawer
      title={`${member.display_name} · ${DAY_LONG[day]}s`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="st-btn st-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="st-btn" onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      {err && <div className="st-error" role="alert">{err}</div>}
      <Switch id="day-working" checked={working} onChange={setWorking} label={working ? "Working" : "Day off"} />
      {working && (
        <>
          <div className="st-field">
            <label htmlFor="day-location">Location</label>
            <select id="day-location" className="st-select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="st-grid-2">
            <div className="st-field">
              <label htmlFor="day-start">Start</label>
              <input id="day-start" type="time" className="st-input" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="st-field">
              <label htmlFor="day-end">Finish</label>
              <input id="day-end" type="time" className="st-input" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {outsideOpening && (
            <div className="st-note st-note--warn">
              {locHours
                ? `${loc?.name} is open ${shortTime(locHours.open_time)}–${shortTime(locHours.close_time)} on ${DAY_LONG[day]}s. Online slots will only show inside opening hours.`
                : `${loc?.name} has no opening hours on ${DAY_LONG[day]}s yet. Set them on Locations.`}
            </div>
          )}
        </>
      )}
      <div className="st-field">
        <span className="st-label">Same on other days</span>
        <div className="st-pick-list">
          {WEEK_DISPLAY_ORDER.filter((d) => d !== day).map((d) => {
            const on = alsoDays.includes(d);
            return (
              <button key={d} type="button" className="st-pick" aria-pressed={on} onClick={() => setAlsoDays(on ? alsoDays.filter((x) => x !== d) : [...alsoDays, d])}>
                {DAY_SHORT[d]}
              </button>
            );
          })}
        </div>
      </div>
      <span className="st-hint">Changes apply after you press Save rota.</span>
    </Drawer>
  );
}

const REASONS = ["Holiday", "Sick", "Cover at other shop", "Training"];

function Exceptions({ staff, locations }: { staff: StaffMemberRow[]; locations: LocationRow[] }) {
  const today = todayIso();
  const [rows, setRows] = useState<RotaExceptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const activeLocs = locations.filter((l) => l.active);
  const [f, setF] = useState({
    staffId: staff[0]?.id ?? "",
    from: today,
    to: today,
    kind: "off" as "off" | "working",
    locationId: activeLocs[0]?.id ?? "",
    start: "09:00",
    end: "18:00",
    reason: "Holiday",
  });

  const staffById = useMemo(() => new Map(staff.map((m) => [m.id, m])), [staff]);
  const locById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const load = useCallback(async () => {
    try {
      const { exceptions } = await staffListRotaExceptions(today);
      setRows(exceptions);
    } catch (e) {
      setError(errorMessage(e, "Could not load holidays and changes"));
    }
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!f.staffId) return setError("Pick a staff member.");
    if (f.to < f.from) return setError("End date must be on or after the start date.");
    if (f.kind === "working" && (!f.locationId || !f.start || !f.end || f.end <= f.start)) return setError("Working days need a location and a finish time after the start.");
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await staffCreateRotaException({
        staff_member_id: f.staffId,
        from_date: f.from,
        to_date: f.to,
        kind: f.kind,
        location_id: f.kind === "working" ? f.locationId : null,
        start_time: f.kind === "working" ? f.start : null,
        end_time: f.kind === "working" ? f.end : null,
        reason: f.reason.trim() || null,
      });
      const who = staffById.get(f.staffId)?.display_name ?? "Staff member";
      setResult(
        `${who}: ${res.saved} ${res.saved === 1 ? "day" : "days"} saved. ` +
          (res.affected_bookings > 0
            ? `${res.affected_bookings} existing ${res.affected_bookings === 1 ? "booking needs" : "bookings need"} moving — see the list below.`
            : "No existing bookings affected.")
      );
      await load();
    } catch (e) {
      setError(errorMessage(e, "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await staffDeleteRotaException(id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(errorMessage(e, "Could not delete"));
    }
  }

  function describe(r: RotaExceptionRow) {
    if (r.kind === "off") return <span className="st-chip">Off</span>;
    const loc = r.location_id ? locById.get(r.location_id) : undefined;
    const i = locations.findIndex((l) => l.id === r.location_id);
    return (
      <span className={`st-loc st-loc--${Math.max(i, 0) % 4}`}>
        {loc ? locationTag(loc.name) : "?"} {shortTime(r.start_time)}–{shortTime(r.end_time)}
      </span>
    );
  }

  return (
    <>
      {error && <div className="st-error" role="alert">{error}</div>}
      <div className="st-card">
        <div className="st-card-head">
          <h2>Add holiday or change</h2>
        </div>
        <div className="st-card-body">
          <div className="st-grid-3">
            <div className="st-field">
              <label htmlFor="ex-staff">Staff</label>
              <select id="ex-staff" className="st-select" value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}>
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="st-field">
              <label htmlFor="ex-from">From</label>
              <input id="ex-from" type="date" className="st-input" min={today} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: e.target.value > f.to ? e.target.value : f.to })} />
            </div>
            <div className="st-field">
              <label htmlFor="ex-to">To (inclusive)</label>
              <input id="ex-to" type="date" className="st-input" min={f.from} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </div>
          </div>
          <div className="st-field">
            <span className="st-label">Change</span>
            <Segmented
              label="Change"
              value={f.kind}
              onChange={(v) => setF({ ...f, kind: v, reason: v === "off" ? "Holiday" : "Cover at other shop" })}
              options={[
                { value: "off", label: "Off" },
                { value: "working", label: "Working different hours or shop" },
              ]}
            />
          </div>
          {f.kind === "working" && (
            <div className="st-grid-3">
              <div className="st-field">
                <label htmlFor="ex-loc">Location</label>
                <select id="ex-loc" className="st-select" value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
                  {activeLocs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="st-field">
                <label htmlFor="ex-start">Start</label>
                <input id="ex-start" type="time" className="st-input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
              </div>
              <div className="st-field">
                <label htmlFor="ex-end">Finish</label>
                <input id="ex-end" type="time" className="st-input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
              </div>
            </div>
          )}
          <div className="st-field">
            <label htmlFor="ex-reason">Reason</label>
            <input id="ex-reason" className="st-input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
            <div className="st-pick-list">
              {REASONS.map((r) => (
                <button key={r} type="button" className="st-pick" aria-pressed={f.reason === r} onClick={() => setF({ ...f, reason: r })}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="st-btn" onClick={add} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <span className="st-hint">Re-entering a day replaces what was there.</span>
          </div>
          {result && <div className={`st-note${result.includes("need") ? " st-note--warn" : ""}`}>{result}</div>}
        </div>
      </div>

      <div className="st-card st-table-wrap">
        <div className="st-card-head">
          <h2>Coming up</h2>
        </div>
        {rows === null ? (
          <div className="st-empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="st-empty">No holidays or changes coming up. Everyone works their regular rota.</div>
        ) : (
          <table className="st-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Staff</th>
                <th>Change</th>
                <th>Reason</th>
                <th>Bookings affected</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = staffById.get(r.staff_member_id);
                return (
                  <tr key={r.id}>
                    <td className="st-num">{shortDate(r.date)}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span className="st-dot" style={{ ["--dot" as string]: m?.colour ?? undefined }} />
                        {m?.display_name ?? "Former staff"}
                      </span>
                    </td>
                    <td>{describe(r)}</td>
                    <td>{r.reason ?? <span className="st-muted">—</span>}</td>
                    <td>
                      {r.affected_bookings > 0 ? (
                        <span className="st-chip st-chip--warn">{r.affected_bookings} to move</span>
                      ) : (
                        <span className="st-chip st-chip--ok">None</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {confirmDelete === r.id ? (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <button type="button" className="st-btn st-btn--danger st-btn--sm" onClick={() => remove(r.id)}>
                            Delete
                          </button>
                          <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={() => setConfirmDelete(null)}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={() => setConfirmDelete(r.id)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
