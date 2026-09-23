import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { clientCancelAppointment, type AppointmentSummary, type BookingContact } from "../../lib/api";
import { formatMoney } from "../../lib/bookingFormat";
import BookingReschedule from "./BookingReschedule";

interface ConfirmedState {
  appointmentId: string;
  bookingReference: string;
  clientId: string;
  serviceId: string;
  contact: BookingContact;
  summary: AppointmentSummary;
}

type View = "summary" | "reschedule" | "cancelled" | "reschedule-done" | "change-requested";

export default function BookingConfirmed() {
  const location = useLocation();
  const state = location.state as ConfirmedState | undefined;
  const [view, setView] = useState<View>("summary");
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state) {
    return (
      <div className="kaaya-shell">
        <div className="kaaya-header">
          <h1>Kaaya</h1>
          <p>Booking confirmed</p>
        </div>
        <div className="kaaya-card">
          <p>We couldn't find the details of this booking on this device.</p>
          <Link to="/book" className="kaaya-btn">
            Book an appointment
          </Link>
        </div>
      </div>
    );
  }

  const { summary, contact, appointmentId, bookingReference, serviceId } = state;

  // Durable across refresh/sharing (unlike router state), and lets the
  // consultation form associate itself with the correct appointment.
  const consultationParams = new URLSearchParams({
    appointment_id: appointmentId,
    booking_reference: bookingReference,
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email,
    phone: contact.phone,
  });

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      const res = await clientCancelAppointment(appointmentId, bookingReference);
      setView(res.status === "cancelled" ? "cancelled" : "change-requested");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel this booking. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  if (view === "cancelled") {
    return (
      <div className="kaaya-shell">
        <div className="kaaya-header">
          <h1>Kaaya</h1>
          <p>Booking cancelled</p>
        </div>
        <div className="kaaya-card">
          <p>Your appointment has been cancelled. We hope to see you another time.</p>
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
          <p>
            This appointment is less than 24 hours away, so your cancellation request has been sent to Kaaya staff for
            approval rather than applied immediately. Keep your booking reference ({bookingReference}) to check back.
          </p>
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
          <p>Your new time has been booked. Save this reference to manage it later: {bookingReference}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kaaya-shell">
      <div className="kaaya-header">
        <h1>Kaaya</h1>
        <p>Booking confirmed</p>
      </div>

      <div className="kaaya-card">
        <p>Your appointment request has been received and is pending approval. We'll be in touch to confirm it.</p>
        <table className="kaaya-table">
          <tbody>
            <tr>
              <th>Treatment</th>
              <td>{summary.service_name}</td>
            </tr>
            <tr>
              <th>Date &amp; time</th>
              <td>
                {new Date(summary.start_at).toLocaleString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
            </tr>
            <tr>
              <th>Duration</th>
              <td>{summary.duration_minutes ? `${summary.duration_minutes} min` : "—"}</td>
            </tr>
            <tr>
              <th>Price</th>
              <td>{formatMoney(summary.price_amount, summary.price_currency)}</td>
            </tr>
            <tr>
              <th>Booking reference</th>
              <td>{bookingReference}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ color: "var(--kaaya-text-muted)", fontSize: "0.85rem" }}>
          Save this reference and bookmark <Link to={`/book/${appointmentId}/manage`}>this booking's manage page</Link> —
          you'll need the reference to cancel or reschedule later.
        </p>
      </div>

      {view === "reschedule" ? (
        <BookingReschedule
          appointmentId={appointmentId}
          bookingReference={bookingReference}
          serviceId={serviceId}
          onDone={(result) => setView(result.status === "rescheduled" ? "reschedule-done" : "change-requested")}
          onCancel={() => setView("summary")}
        />
      ) : (
        <div className="kaaya-card">
          <h2 style={{ marginTop: 0 }}>Need to make a change?</h2>
          {error && <p className="kaaya-error">{error}</p>}
          <div className="kaaya-btn-row">
            <button type="button" className="kaaya-btn kaaya-btn--secondary" onClick={() => setView("reschedule")}>
              Request a different time
            </button>
            <button type="button" className="kaaya-btn kaaya-btn--secondary" onClick={cancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel this booking"}
            </button>
          </div>
        </div>
      )}

      <div className="kaaya-card">
        <h2 style={{ marginTop: 0 }}>One more step</h2>
        <p>Please complete a short consultation before your appointment so Kaaya can flag anything relevant.</p>
        <Link to={`/consultation?${consultationParams.toString()}`} className="kaaya-btn">
          Continue to your consultation
        </Link>
      </div>
    </div>
  );
}
