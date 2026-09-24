import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { CalendarData } from "../../../lib/api";
import { Drawer, Switch } from "../../../components/staff/ui";
import { staffColour, type CalendarPrefs } from "./shared";

export default function ViewDrawer({
  prefs,
  data,
  autoStaffIds,
  onChange,
  onClose,
}: {
  prefs: CalendarPrefs;
  data: CalendarData | null;
  autoStaffIds: string[];
  onChange: (patch: Partial<CalendarPrefs>) => void;
  onClose: () => void;
}) {
  const staff = (data?.staff ?? []).filter((s) => s.active);
  const week = prefs.view === "week";
  const selected = new Set(prefs.staffIds ?? autoStaffIds);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ staffIds: staff.filter((s) => next.has(s.id)).map((s) => s.id) });
  }

  return (
    <Drawer title="Calendar view" onClose={onClose}>
      <div className="st-field">
        <span className="st-label">{week ? "Show one person's week" : "Staff"}</span>
        {!week && (
          <Switch
            id="v-auto"
            checked={prefs.staffIds === null}
            onChange={(on) => onChange({ staffIds: on ? null : [...selected] })}
            label="Just whoever is working (rota or bookings)"
          />
        )}
        <div className="st-view-staff">
          {staff.map((s) =>
            week ? (
              <label key={s.id} className="st-check">
                <input type="radio" name="week-staff" checked={prefs.weekStaffId === s.id} onChange={() => onChange({ weekStaffId: s.id })} />
                <span className="st-dot" style={{ "--dot": staffColour(s.colour) } as CSSProperties} />
                {s.display_name}
              </label>
            ) : (
              <label key={s.id} className="st-check">
                <input type="checkbox" checked={selected.has(s.id)} disabled={prefs.staffIds === null} onChange={() => toggle(s.id)} />
                <span className="st-dot" style={{ "--dot": staffColour(s.colour) } as CSSProperties} />
                {s.display_name}
              </label>
            )
          )}
        </div>
      </div>

      <div className="st-field">
        <span className="st-label">Appointments</span>
        <Switch id="v-conf" checked={prefs.showConfirmed} onChange={(v) => onChange({ showConfirmed: v })} label="Confirmed (and completed)" />
        <Switch id="v-pend" checked={prefs.showPending} onChange={(v) => onChange({ showPending: v })} label="Pending approval (online requests)" />
        <Switch id="v-canc" checked={prefs.showCancelled} onChange={(v) => onChange({ showCancelled: v })} label="Cancelled" />
      </div>

      <p className="st-hint">
        These settings are remembered on this device only. Working hours and holidays are on the <Link to="/staff/rota">Rota</Link>.
      </p>
    </Drawer>
  );
}
