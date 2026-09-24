import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  staffApproveAppointment,
  staffCancelAppointment,
  staffMarkCompleted,
  staffMarkNoShow,
  staffRescheduleAppointment,
  type CalendarAppointment,
  type CalendarData,
} from "../../../lib/api";
import { clockTime, durationLabel, londonDayMinutes, londonWallToIso } from "../../../lib/calendarLayout";
import { shortDate } from "../../../lib/staffFormat";
import { Drawer, errorMessage } from "../../../components/staff/ui";
import { apptTitle, money, STATUS_CHIP, STATUS_LABEL, staffColour } from "./shared";

type Mode = "view" | "reschedule" | "cancel";

export default function AppointmentPanel({
  appointment: a,
  data,
  onClose,
  onChanged,
  onOpenOther,
  onBookNext,
}: {
  appointment: CalendarAppointment;
  data: CalendarData;
  onClose: () => void;
  onChanged: () => void;
  onOpenOther: (a: CalendarAppointment) => void;
  onBookNext: (a: CalendarAppointment) => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = londonDayMinutes(a.scheduled_at);
  const [newDate, setNewDate] = useState(start.date);
  const [newTime, setNewTime] = useState(clockTime(a.scheduled_at));
  const [newStaff, setNewStaff] = useState(a.staff_member_id);
  const [reason, setReason] = useState("");

  const staff = new Map(data.staff.map((s) => [s.id, s]));
  const member = staff.get(a.staff_member_id);
  const minutes = Math.round((Date.parse(a.end_at) - Date.parse(a.scheduled_at)) / 60000);
  const started = Date.now() >= Date.parse(a.scheduled_at);
  const active = a.status === "pending_approval" || a.status === "confirmed";
  const visitParts = a.visit_id
    ? data.appointments.filter((x) => x.visit_id === a.visit_id && x.id !== a.id && x.status !== "cancelled")
    : [];
  const items = a.appointment_items.length
    ? a.appointment_items
    : [{ id: a.id, service_id: a.service_id, service_name: a.service_name, duration_minutes: a.duration_minutes, price_amount: a.price_amount, staff_member_id: a.staff_member_id }];

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(errorMessage(e, "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  const footer =
    mode === "reschedule" ? (
      <>
        <button type="button" className="st-btn st-btn--ghost" onClick={() => setMode("view")} disabled={busy}>
          Back
        </button>
        <button
          type="button"
          className="st-btn"
          disabled={busy || !newDate || !newTime}
          onClick={() => run(() => staffRescheduleAppointment(a.id, londonWallToIso(newDate, newTime), newStaff))}
        >
          {busy ? "Moving…" : "Move appointment"}
        </button>
      </>
    ) : mode === "cancel" ? (
      <>
        <button type="button" className="st-btn st-btn--ghost" onClick={() => setMode("view")} disabled={busy}>
          Keep it
        </button>
        <button type="button" className="st-btn st-btn--danger" disabled={busy} onClick={() => run(() => staffCancelAppointment(a.id, reason || undefined))}>
          {busy ? "Cancelling…" : "Cancel appointment"}
        </button>
      </>
    ) : active ? (
      <>
        {a.status === "pending_approval" && (
          <button type="button" className="st-btn" disabled={busy || started} onClick={() => run(() => staffApproveAppointment(a.id))}>
            Approve
          </button>
        )}
        {a.status === "confirmed" && started && (
          <>
            <button type="button" className="st-btn st-btn--ghost" disabled={busy} onClick={() => run(() => staffMarkNoShow(a.id))}>
              No-show
            </button>
            <button type="button" className="st-btn" disabled={busy} onClick={() => run(() => staffMarkCompleted(a.id))}>
              Complete
            </button>
          </>
        )}
      </>
    ) : undefined;

  return (
    <Drawer title={apptTitle(a)} onClose={onClose} footer={footer}>
      <div className="st-panel-chips">
        <span className={STATUS_CHIP[a.status]}>{STATUS_LABEL[a.status]}</span>
        <span className="st-chip">{a.booking_source === "staff" ? "Booked by staff" : "Booked online"}</span>
        {a.patch_test && <span className="st-chip st-chip--warn">Patch test needed</span>}
      </div>

      {a.clients && (
        <div className="st-panel-block">
          <a href={`tel:${a.clients.phone.replace(/\s+/g, "")}`}>{a.clients.phone}</a>
          {a.clients.email && <span className="st-muted">{a.clients.email}</span>}
          <Link to={`/staff/clients/${a.client_id}`}>Client record →</Link>
        </div>
      )}

      <dl className="st-panel-dl">
        <dt>When</dt>
        <dd>
          {shortDate(start.date)}, {clockTime(a.scheduled_at)}–{clockTime(a.end_at)} ({durationLabel(minutes)})
        </dd>
        <dt>With</dt>
        <dd>
          <span className="st-dot" style={{ "--dot": staffColour(member?.colour) } as CSSProperties} /> {member?.display_name ?? "Unknown"}
        </dd>
        <dt>Where</dt>
        <dd>{data.location.name}</dd>
        <dt>Consultation</dt>
        <dd>{a.consultation_id ? <Link to={`/staff/consultations/${a.consultation_id}`}>Form received →</Link> : <span className="st-muted">Not received yet</span>}</dd>
      </dl>

      <div className="st-group-block">
        <div className="st-group-block-head">
          <span>Treatments</span>
          <span>{money(items.reduce((n, i) => n + i.price_amount, 0))}</span>
        </div>
        <ul className="st-panel-items">
          {items.map((i) => (
            <li key={i.id}>
              <span>{i.service_name}</span>
              <span className="st-muted">
                {durationLabel(i.duration_minutes)} · {money(i.price_amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {visitParts.length > 0 && (
        <div className="st-panel-block">
          <b>Also in this visit</b>
          {visitParts.map((p) => (
            <button key={p.id} type="button" className="st-link" onClick={() => onOpenOther(p)}>
              {clockTime(p.scheduled_at)} {p.service_name} with {staff.get(p.staff_member_id)?.display_name ?? "someone"}
            </button>
          ))}
        </div>
      )}

      {mode === "view" && active && (
        <div className="st-panel-actions">
          <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={() => onBookNext(a)}>
            + Next treatment in this visit
          </button>
          <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={() => setMode("reschedule")}>
            Move
          </button>
          <button type="button" className="st-btn st-btn--danger st-btn--sm" onClick={() => setMode("cancel")}>
            Cancel…
          </button>
        </div>
      )}

      {mode === "reschedule" && (
        <div className="st-card-body st-panel-form">
          <div className="st-grid-2">
            <div className="st-field">
              <label htmlFor="mv-date">Date</label>
              <input id="mv-date" className="st-input" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div className="st-field">
              <label htmlFor="mv-time">Start</label>
              <input id="mv-time" className="st-input" type="time" step={300} value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </div>
          </div>
          <div className="st-field">
            <label htmlFor="mv-staff">With</label>
            <select id="mv-staff" className="st-select" value={newStaff} onChange={(e) => setNewStaff(e.target.value)}>
              {data.staff
                .filter((s) => s.active || s.id === a.staff_member_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
            </select>
          </div>
          <span className="st-hint">Staff can move bookings to any time. Same length ({durationLabel(minutes)}), same location.</span>
        </div>
      )}

      {mode === "cancel" && (
        <div className="st-field">
          <label htmlFor="cx-reason">Reason (optional)</label>
          <input id="cx-reason" className="st-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. client called to cancel" />
        </div>
      )}

      {a.status === "pending_approval" && started && mode === "view" && (
        <p className="st-note st-note--warn">This time has passed without being approved. Cancel it, or move it to a new time.</p>
      )}
      {error && <p className="st-error">{error}</p>}
    </Drawer>
  );
}
