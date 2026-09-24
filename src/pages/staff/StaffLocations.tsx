import { useCallback, useEffect, useState } from "react";
import {
  staffListLocations,
  staffCreateLocation,
  staffUpdateLocation,
  staffSetLocationHours,
  staffGetBookingSettings,
  staffUpdateBookingSettings,
  type LocationRow,
} from "../../lib/api";
import { DAY_LONG, WEEK_DISPLAY_ORDER, shortTime, toTimeInput } from "../../lib/staffFormat";
import { PageHead, Switch, errorMessage } from "../../components/staff/ui";

type DayEdit = { day_of_week: number; open: boolean; open_time: string; close_time: string };

function toDayEdits(location: LocationRow): DayEdit[] {
  return WEEK_DISPLAY_ORDER.map((d) => {
    const h = location.hours.find((x) => x.day_of_week === d);
    return {
      day_of_week: d,
      open: !!h,
      open_time: h ? toTimeInput(h.open_time) : "09:00",
      close_time: h ? toTimeInput(h.close_time) : "18:00",
    };
  });
}

function todaysHours(location: LocationRow): string {
  const today = new Date().getDay();
  const h = location.hours.find((x) => x.day_of_week === today);
  if (location.hours.length === 0) return "No opening hours set";
  return h ? `Open today ${shortTime(h.open_time)}–${shortTime(h.close_time)}` : "Closed today";
}

export default function StaffLocations() {
  const [locations, setLocations] = useState<LocationRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [details, setDetails] = useState({ name: "", phone: "", email: "", active: true });
  const [days, setDays] = useState<DayEdit[]>([]);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [windowDays, setWindowDays] = useState("");
  const [savingWindow, setSavingWindow] = useState(false);
  const [windowSaved, setWindowSaved] = useState(false);

  const load = useCallback(async (keepId?: string | null) => {
    try {
      const { locations } = await staffListLocations();
      setLocations(locations);
      const pick = locations.find((l) => l.id === keepId) ?? locations[0] ?? null;
      setSelectedId(pick?.id ?? null);
      if (pick) {
        setDetails({ name: pick.name, phone: pick.phone ?? "", email: pick.email ?? "", active: pick.active });
        setDays(toDayEdits(pick));
      }
    } catch (e) {
      setError(errorMessage(e, "Could not load locations"));
    }
  }, []);

  useEffect(() => {
    load();
    staffGetBookingSettings()
      .then((s) => setWindowDays(String(s.client_booking_window_days)))
      .catch(() => undefined);
  }, [load]);

  function select(location: LocationRow) {
    setSelectedId(location.id);
    setDetails({ name: location.name, phone: location.phone ?? "", email: location.email ?? "", active: location.active });
    setDays(toDayEdits(location));
    setSavedMsg(null);
    setError(null);
  }

  async function addLocation() {
    if (!newName.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const { id } = await staffCreateLocation({ name: newName.trim() });
      setNewName("");
      await load(id);
    } catch (e) {
      setError(errorMessage(e, "Could not add location"));
    } finally {
      setAdding(false);
    }
  }

  async function saveDetails() {
    if (!selectedId) return;
    setSavingDetails(true);
    setError(null);
    setSavedMsg(null);
    try {
      await staffUpdateLocation(selectedId, {
        name: details.name.trim(),
        phone: details.phone.trim() || null,
        email: details.email.trim() || null,
        active: details.active,
      });
      await load(selectedId);
      setSavedMsg("Details saved");
    } catch (e) {
      setError(errorMessage(e, "Could not save details"));
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveHours() {
    if (!selectedId) return;
    const bad = days.find((d) => d.open && (!d.open_time || !d.close_time || d.close_time <= d.open_time));
    if (bad) {
      setError(`${DAY_LONG[bad.day_of_week]}: closing time must be after opening time.`);
      return;
    }
    setSavingHours(true);
    setError(null);
    setSavedMsg(null);
    try {
      await staffSetLocationHours(
        selectedId,
        days.map((d) => ({
          day_of_week: d.day_of_week,
          open_time: d.open ? d.open_time : null,
          close_time: d.open ? d.close_time : null,
        }))
      );
      await load(selectedId);
      setSavedMsg("Opening hours saved");
    } catch (e) {
      setError(errorMessage(e, "Could not save opening hours"));
    } finally {
      setSavingHours(false);
    }
  }

  async function saveWindow() {
    const n = parseInt(windowDays, 10);
    if (!Number.isInteger(n) || n < 1 || n > 730) {
      setError("Booking window must be between 1 and 730 days.");
      return;
    }
    setSavingWindow(true);
    setWindowSaved(false);
    setError(null);
    try {
      await staffUpdateBookingSettings({ client_booking_window_days: n });
      setWindowSaved(true);
    } catch (e) {
      setError(errorMessage(e, "Could not save booking window"));
    } finally {
      setSavingWindow(false);
    }
  }

  function updateDay(dow: number, patch: Partial<DayEdit>) {
    setDays((prev) => prev.map((d) => (d.day_of_week === dow ? { ...d, ...patch } : d)));
    setSavedMsg(null);
  }

  function copyMondayToWeekdays() {
    const mon = days.find((d) => d.day_of_week === 1);
    if (!mon) return;
    setDays((prev) => prev.map((d) => (d.day_of_week >= 2 && d.day_of_week <= 5 ? { ...d, open: mon.open, open_time: mon.open_time, close_time: mon.close_time } : d)));
  }

  const selected = locations?.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="st-page">
      <PageHead title="Locations" subtitle="Shops, their contact details and opening hours. Clients pick a location first when booking." />

      {error && <div className="st-error" role="alert">{error}</div>}

      <div className="st-split">
        <div className="st-card">
          <div className="st-card-head">
            <h2>All locations</h2>
          </div>
          {locations === null ? (
            <div className="st-empty">Loading…</div>
          ) : (
            <div>
              {locations.map((l) => (
                <button key={l.id} type="button" className="st-row-btn" aria-current={l.id === selectedId} onClick={() => select(l)}>
                  <b>
                    {l.name} {!l.active && <span className="st-chip">Hidden</span>}
                  </b>
                  <span className="st-muted">{todaysHours(l)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="st-card-body">
            <div className="st-field">
              <label htmlFor="new-location">Add a location</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="new-location"
                  className="st-input"
                  placeholder="e.g. Union Square"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addLocation()}
                />
                <button type="button" className="st-btn st-btn--ghost" onClick={addLocation} disabled={adding || !newName.trim()}>
                  {adding ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="st-card">
              <div className="st-card-head">
                <h2>Details</h2>
                {savedMsg === "Details saved" && <span className="st-saved">Saved</span>}
              </div>
              <div className="st-card-body">
                <div className="st-grid-3">
                  <div className="st-field">
                    <label htmlFor="loc-name">Name</label>
                    <input id="loc-name" className="st-input" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
                  </div>
                  <div className="st-field">
                    <label htmlFor="loc-phone">Phone</label>
                    <input id="loc-phone" className="st-input" type="tel" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} />
                  </div>
                  <div className="st-field">
                    <label htmlFor="loc-email">Email</label>
                    <input id="loc-email" className="st-input" type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} />
                  </div>
                </div>
                <Switch
                  id="loc-active"
                  checked={details.active}
                  onChange={(v) => setDetails({ ...details, active: v })}
                  label={details.active ? "Shown to clients" : "Hidden from clients"}
                />
                <div>
                  <button type="button" className="st-btn" onClick={saveDetails} disabled={savingDetails || !details.name.trim()}>
                    {savingDetails ? "Saving…" : "Save details"}
                  </button>
                </div>
              </div>
            </div>

            <div className="st-card">
              <div className="st-card-head">
                <h2>Opening hours</h2>
                <div className="st-head-actions">
                  {savedMsg === "Opening hours saved" && <span className="st-saved">Saved</span>}
                  <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={copyMondayToWeekdays}>
                    Copy Monday to Tue–Fri
                  </button>
                </div>
              </div>
              <div className="st-table-wrap">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Open</th>
                      <th>Opens</th>
                      <th>Closes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => (
                      <tr key={d.day_of_week}>
                        <td>{DAY_LONG[d.day_of_week]}</td>
                        <td>
                          <Switch id={`open-${d.day_of_week}`} checked={d.open} onChange={(v) => updateDay(d.day_of_week, { open: v })} label={d.open ? "Open" : "Closed"} />
                        </td>
                        <td>
                          <input
                            aria-label={`${DAY_LONG[d.day_of_week]} opens`}
                            type="time"
                            className="st-input st-input--time"
                            value={d.open_time}
                            disabled={!d.open}
                            onChange={(e) => updateDay(d.day_of_week, { open_time: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`${DAY_LONG[d.day_of_week]} closes`}
                            type="time"
                            className="st-input st-input--time"
                            value={d.close_time}
                            disabled={!d.open}
                            onChange={(e) => updateDay(d.day_of_week, { close_time: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="st-card-body">
                <div>
                  <button type="button" className="st-btn" onClick={saveHours} disabled={savingHours}>
                    {savingHours ? "Saving…" : "Save opening hours"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="st-card">
        <div className="st-card-head">
          <h2>Online booking</h2>
          {windowSaved && <span className="st-saved">Saved</span>}
        </div>
        <div className="st-card-body">
          <div className="st-field">
            <label htmlFor="window-days">How far ahead clients can book online (days)</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                id="window-days"
                className="st-input st-input--narrow"
                inputMode="numeric"
                value={windowDays}
                onChange={(e) => {
                  setWindowDays(e.target.value);
                  setWindowSaved(false);
                }}
              />
              <button type="button" className="st-btn st-btn--ghost" onClick={saveWindow} disabled={savingWindow}>
                {savingWindow ? "Saving…" : "Save"}
              </button>
            </div>
            <span className="st-hint">Applies to all locations. Staff can always book further ahead. Every online booking is reviewed before it's confirmed.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
