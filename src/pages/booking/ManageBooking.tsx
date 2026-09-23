import { useState } from "react";
import { useParams } from "react-router-dom";
import { getAppointmentByReference, clientCancelAppointment, type AppointmentLookup } from "../../lib/api";
import { formatMoney } from "../../lib/bookingFormat";
import BookingReschedule from "./BookingReschedule";

const STATUS_LABEL: Record<AppointmentLookup["status"], string> = {
  pending_approval: "Pending approval",
  confirmed: "Confirmed",
  completed: "Completed",
  no_show: "No-show",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

type View = "lookup" | "status" | "reschedule" | "cancelled" | "change-requested" | "reschedule-done";

export default function ManageBooking() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [reference, setReference] = useState("");
  const [appointment, setAppointment] = useState<AppointmentLookup | null>(null);
  const [canSelfServiceImmediately, setCanSelfServiceImmediately] = useState(false);
  const [view, setView] = useState<View>("lookup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!appointmentId) {
    return (
      <div className="kaaya-shell">
        <div className="kaaya-header">
          <h1>Kaaya</h1>
          <p>Manage a booking</p>
        </div>
        <div className="kaaya-card">
          <p>This link is missing its booking id. Use the "manage this booking" link from your confirmation page.</p>
        </div>
      </div>
    );
  }

  async function lookup() {
    setLoading(true);
    setError(null);
    try {
      const res = await getAppointmentByReference(appointmentId!, reference.trim());
      setAppointment(res.appointment);
      setCanSelfServiceImmediately(res.can_self_service_immediately);
      setView("status");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not find this booking. Check your reference and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    setLoading(true);
    setError(null);
    try {
      const res = await clientCancelAppointment(appointmentId!, reference.trim());
      setView(res.status === "cancelled" ? "cancelled" : "change-requested");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel this booking. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (view === "lookup") {
    return (
      <div className="kaaya-shell">
        <div className="kaaya-header">
          <h1>Kaaya</h1>
          <p>Manage a booking</p>
        </div>
        <div className="kaaya-card">
          <div className="kaaya-field">
            <label htmlFor="manage-reference">Booking reference</label>
            <input id="manage-reference" type="text" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          {error && <p className="kaaya-error">{error}</p>}
          <button type="button" className="kaaya-btn" disabled={!reference.trim() || loading} onClick={lookup}>
            {loading ? "Looking up…" : "Find my booking"}
          </button>
        </div>
      </div>
    );
  }

  if (view === "cancelled") {
    return (
      <div className="kaaya-shell">
        <div className="kaaya-header">
          <h1>Kaaya</h1>
          <p>Booking cancelled</p>
        </div>
        <div className="kaaya-card">
          <p>Your appointment has been cancelled.</p>
        </div>
      </div>
    );
  }

  if (view === "change-requested") {
    return (
      <div className="kaaya-shell">
        <div className="kaaya-header">
          <h1>Kaaya</h1>
          <p>Request received</p>
        </div>
        <div className="kaaya-card">
          <p>This appointment is less than 24 hours away, so your request has been sent to Kaaya staff for approval.</p>
        </div>
      </div>
    );
  }

  if (view === "reschedule-done") {
    return (
      <div className="kaaya-shell">
        <div className="kaaya-header">
          <h1>Kaaya</h1>
          <p>Reschedule requested</p>
        </div>
        <div className="kaaya-card">
          <p>Your new time has been booked.</p>
        </div>
      </div>
    );
  }

  if (!appointment) return null;
  const canAct = ["pending_approval", "confirmed"].includes(appointment.status);

  return (
    <div className="kaaya-shell">
      <div className="kaaya-header">
        <h1>Kaaya</h1>
        <p>Your booking</p>
      </div>

      <div className="kaaya-card">
        <table className="kaaya-table">
          <tbody>
            <tr>
              <th>Status</th>
              <td>{STATUS_LABEL[appointment.status]}</td>
            </tr>
            <tr>
              <th>Treatment</th>
              <td>{appointment.service_name}</td>
            </tr>
            <tr>
              <th>Date &amp; time</th>
              <td>
                {new Date(appointment.scheduled_at).toLocaleString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
            </tr>
            <tr>
              <th>Price</th>
              <td>{formatMoney(appointment.price_amount, appointment.price_currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {canAct && view === "status" && (
        <div className="kaaya-card">
          {!canSelfServiceImmediately && (
            <p style={{ color: "var(--kaaya-text-muted)" }}>
              This appointment is less than 24 hours away — changes will be sent to Kaaya staff for approval rather
              than applied immediately.
            </p>
          )}
          {error && <p className="kaaya-error">{error}</p>}
          <div className="kaaya-btn-row">
            <button type="button" className="kaaya-btn kaaya-btn--secondary" onClick={() => setView("reschedule")}>
              Request a different time
            </button>
            <button type="button" className="kaaya-btn kaaya-btn--secondary" onClick={cancel} disabled={loading}>
              {loading ? "Cancelling…" : "Cancel this booking"}
            </button>
          </div>
        </div>
      )}

      {canAct && view === "reschedule" && (
        <BookingReschedule
          appointmentId={appointmentId!}
          bookingReference={reference.trim()}
          serviceId={appointment.service_id}
          onDone={(result) => setView(result.status === "rescheduled" ? "reschedule-done" : "change-requested")}
          onCancel={() => setView("status")}
        />
      )}
    </div>
  );
}
