import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import {
  staffListAppointments,
  staffApproveAppointment,
  staffCancelAppointment,
  staffRescheduleAppointment,
  staffMarkCompleted,
  staffMarkNoShow,
  staffListChangeRequests,
  staffResolveChangeRequest,
  staffGetRevenueSummary,
  getAvailability,
  type StaffAppointmentRow,
  type ChangeRequestRow,
  type AppointmentStatus,
  type AvailabilitySlot,
} from "../../lib/api";
import { formatMoney, todayIso } from "../../lib/bookingFormat";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending_approval: "Pending approval",
  confirmed: "Confirmed",
  completed: "Completed",
  no_show: "No-show",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  pending_approval: "MEDIUM",
  confirmed: "INFORMATION",
  completed: "INFORMATION",
  no_show: "HIGH",
  cancelled: "INFORMATION",
  rescheduled: "INFORMATION",
};

function ReschedulePicker({
  appointmentId,
  serviceId,
  onDone,
  onCancel,
}: {
  appointmentId: string;
  serviceId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAvailability(serviceId, date)
      .then((res) => setSlots(res.slots))
      .catch(() => setError("Could not load availability."))
      .finally(() => setLoading(false));
  }, [serviceId, date]);

  async function pick(slot: AvailabilitySlot) {
    setSubmitting(true);
    setError(null);
    try {
      await staffRescheduleAppointment(appointmentId, slot.startAt, slot.staffMemberId);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reschedule.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ marginTop: 10, padding: 10, border: "1px solid var(--kaaya-border)", borderRadius: 10 }}>
      <div className="kaaya-field" style={{ maxWidth: 200 }}>
        <label htmlFor={`reschedule-date-${appointmentId}`}>New date</label>
        <input
          id={`reschedule-date-${appointmentId}`}
          type="date"
          min={todayIso()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {loading && <p>Loading availability…</p>}
      {error && <p className="kaaya-error">{error}</p>}
      {!loading && slots.length === 0 && <p>No availability on this date.</p>}
      {!loading &&
        slots.map((slot) => (
          <div
            key={`${slot.staffMemberId}-${slot.startAt}`}
            className="kaaya-list-row"
            style={{ cursor: submitting ? "default" : "pointer" }}
            onClick={() => !submitting && pick(slot)}
          >
            <strong>{new Date(slot.startAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</strong>
            <span style={{ marginLeft: 8, color: "var(--kaaya-text-muted)" }}>{slot.staffMemberName}</span>
          </div>
        ))}
      <button type="button" className="kaaya-btn kaaya-btn--secondary" style={{ marginTop: 8 }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

export default function StaffBookings() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [appointments, setAppointments] = useState<StaffAppointmentRow[] | null>(null);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<{ total_amount: number; currency: string; appointment_count: number } | null>(
    null
  );
  const [revenueDenied, setRevenueDenied] = useState(false);

  function load(d: string, s: AppointmentStatus | "") {
    staffListAppointments(d, s || undefined)
      .then((res) => setAppointments(res.appointments))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load bookings"));

    staffListChangeRequests("pending")
      .then((res) => setChangeRequests(res.changeRequests))
      .catch(() => setChangeRequests([]));

    if (!revenueDenied) {
      staffGetRevenueSummary(d)
        .then((res) => setRevenue(res))
        .catch(() => setRevenueDenied(true));
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/staff/login");
        return;
      }
      load(date, statusFilter);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, date, statusFilter]);

  async function act(id: string, action: () => Promise<unknown>) {
    setActingId(id);
    setError(null);
    try {
      await action();
      load(date, statusFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this booking");
    } finally {
      setActingId(null);
    }
  }

  async function cancelWithReason(id: string) {
    const reason = window.prompt("Reason for cancelling (optional):") ?? undefined;
    await act(id, () => staffCancelAppointment(id, reason || undefined));
  }

  async function resolveRequest(id: string, decision: "approve" | "reject") {
    setActingId(id);
    setError(null);
    try {
      await staffResolveChangeRequest(id, decision);
      load(date, statusFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve this request");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="kaaya-shell kaaya-shell--wide">
      <div className="kaaya-header">
        <h1>Kaaya — Bookings</h1>
        <p>Your schedule — or everyone's, if your account has that capability.</p>
      </div>

      <p>
        <Link to="/staff">← Back to consultations</Link> · <Link to="/staff/services">Services</Link> ·{" "}
        <Link to="/staff/staff-members">Staff members</Link>
      </p>

      {changeRequests && changeRequests.length > 0 && (
        <div className="kaaya-card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Pending client requests</h2>
          {changeRequests.map((cr) => (
            <div key={cr.id} style={{ borderBottom: "1px solid var(--kaaya-border)", padding: "10px 0" }}>
              <strong>{cr.request_type === "cancel" ? "Cancel" : "Reschedule"} request</strong>
              {cr.appointments && (
                <span style={{ marginLeft: 8 }}>
                  {cr.appointments.service_name} —{" "}
                  {new Date(cr.appointments.scheduled_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              {cr.request_type === "reschedule" && cr.requested_start_at && (
                <div style={{ color: "var(--kaaya-text-muted)", fontSize: "0.85rem" }}>
                  Requested new time:{" "}
                  {new Date(cr.requested_start_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
              {cr.reason && <div style={{ color: "var(--kaaya-text-muted)", fontSize: "0.85rem" }}>Reason: {cr.reason}</div>}
              <div className="kaaya-btn-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="kaaya-btn kaaya-btn--secondary"
                  disabled={actingId === cr.id}
                  onClick={() => resolveRequest(cr.id, "approve")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="kaaya-btn kaaya-btn--secondary"
                  disabled={actingId === cr.id}
                  onClick={() => resolveRequest(cr.id, "reject")}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="kaaya-card">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div className="kaaya-field" style={{ maxWidth: 200, marginBottom: 0 }}>
            <label htmlFor="bookings-date">Date</label>
            <input id="bookings-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="kaaya-field" style={{ maxWidth: 220, marginBottom: 0 }}>
            <label htmlFor="bookings-status">Status</label>
            <select
              id="bookings-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | "")}
            >
              <option value="">All statuses</option>
              {(Object.keys(STATUS_LABEL) as AppointmentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {revenue && (
          <p>
            <strong>Today's total:</strong> {formatMoney(revenue.total_amount, revenue.currency)} across{" "}
            {revenue.appointment_count} booking{revenue.appointment_count === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {error && <p className="kaaya-error">{error}</p>}

      {appointments && (
        <div className="kaaya-card">
          {appointments.length === 0 && <p>No bookings for this date.</p>}
          {appointments.map((a) => (
            <div key={a.id} style={{ borderBottom: "1px solid var(--kaaya-border)", padding: "10px 0" }}>
              <strong>{new Date(a.scheduled_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</strong>
              <span style={{ marginLeft: 8 }}>{a.service_name}</span>
              <span style={{ marginLeft: 8, color: "var(--kaaya-text-muted)" }}>
                {formatMoney(a.price_amount, a.price_currency)}
              </span>
              <span className={`kaaya-badge kaaya-badge--${STATUS_BADGE[a.status]}`} style={{ marginLeft: 8 }}>
                {STATUS_LABEL[a.status]}
              </span>
              {a.status === "rescheduled" && a.rescheduled_to_id && (
                <span style={{ marginLeft: 8, color: "var(--kaaya-text-muted)", fontSize: "0.85rem" }}>
                  → rescheduled
                </span>
              )}
              <div style={{ marginTop: 4 }}>
                <Link to={`/staff/clients/${a.client_id}`} style={{ fontSize: "0.85rem" }}>
                  View client
                </Link>
              </div>

              <div className="kaaya-btn-row" style={{ marginTop: 8 }}>
                {a.status === "pending_approval" && (
                  <button
                    type="button"
                    className="kaaya-btn kaaya-btn--secondary"
                    disabled={actingId === a.id}
                    onClick={() => act(a.id, () => staffApproveAppointment(a.id))}
                  >
                    Approve
                  </button>
                )}
                {(a.status === "pending_approval" || a.status === "confirmed") && (
                  <>
                    <button
                      type="button"
                      className="kaaya-btn kaaya-btn--secondary"
                      disabled={actingId === a.id}
                      onClick={() => setReschedulingId(reschedulingId === a.id ? null : a.id)}
                    >
                      Reschedule
                    </button>
                    <button
                      type="button"
                      className="kaaya-btn kaaya-btn--secondary"
                      disabled={actingId === a.id}
                      onClick={() => cancelWithReason(a.id)}
                    >
                      {actingId === a.id ? "Working…" : "Cancel"}
                    </button>
                  </>
                )}
                {a.status === "confirmed" && (
                  <>
                    <button
                      type="button"
                      className="kaaya-btn kaaya-btn--secondary"
                      disabled={actingId === a.id}
                      onClick={() => act(a.id, () => staffMarkCompleted(a.id))}
                    >
                      Mark completed
                    </button>
                    <button
                      type="button"
                      className="kaaya-btn kaaya-btn--secondary"
                      disabled={actingId === a.id}
                      onClick={() => act(a.id, () => staffMarkNoShow(a.id))}
                    >
                      Mark no-show
                    </button>
                  </>
                )}
              </div>

              {reschedulingId === a.id && (
                <ReschedulePicker
                  appointmentId={a.id}
                  serviceId={a.service_id}
                  onDone={() => {
                    setReschedulingId(null);
                    load(date, statusFilter);
                  }}
                  onCancel={() => setReschedulingId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
