import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import {
  staffListAppointments,
  staffCancelAppointment,
  staffGetRevenueSummary,
  type StaffAppointmentRow,
} from "../../lib/api";
import { formatMoney, todayIso } from "../../lib/bookingFormat";

export default function StaffBookings() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());
  const [appointments, setAppointments] = useState<StaffAppointmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // Revenue is a separate, optional call — omitted entirely (never rendered)
  // for a staff login that doesn't hold the view_revenue capability, rather
  // than fetched and hidden, so a 403 never even reaches this screen.
  const [revenue, setRevenue] = useState<{ total_amount: number; currency: string; appointment_count: number } | null>(
    null
  );
  const [revenueDenied, setRevenueDenied] = useState(false);

  function load(d: string) {
    staffListAppointments(d)
      .then((res) => setAppointments(res.appointments))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load bookings"));

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
      load(date);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, date]);

  async function cancel(id: string) {
    setCancellingId(id);
    setError(null);
    try {
      await staffCancelAppointment(id);
      load(date);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel booking");
    } finally {
      setCancellingId(null);
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

      <div className="kaaya-field" style={{ maxWidth: 200 }}>
        <label htmlFor="bookings-date">Date</label>
        <input id="bookings-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {revenue && (
        <p>
          <strong>Today's total:</strong> {formatMoney(revenue.total_amount, revenue.currency)} across{" "}
          {revenue.appointment_count} booking{revenue.appointment_count === 1 ? "" : "s"}
        </p>
      )}

      {error && <p className="kaaya-error">{error}</p>}

      {appointments && (
        <div className="kaaya-card">
          {appointments.length === 0 && <p>No bookings for this date.</p>}
          {appointments.map((a) => (
            <div key={a.id} className="kaaya-list-row" style={{ padding: "10px 0" }}>
              <strong>{new Date(a.scheduled_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</strong>
              <span style={{ marginLeft: 8 }}>{a.service_name}</span>
              <span style={{ marginLeft: 8, color: "var(--kaaya-text-muted)" }}>
                {formatMoney(a.price_amount, a.price_currency)}
              </span>
              {a.status === "cancelled" ? (
                <span className="kaaya-badge kaaya-badge--INFORMATION" style={{ marginLeft: 8 }}>
                  Cancelled
                </span>
              ) : (
                <button
                  type="button"
                  className="kaaya-btn kaaya-btn--secondary"
                  style={{ marginLeft: 8 }}
                  disabled={cancellingId === a.id}
                  onClick={() => cancel(a.id)}
                >
                  {cancellingId === a.id ? "Cancelling…" : "Cancel"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
