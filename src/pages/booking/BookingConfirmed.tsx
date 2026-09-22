import { Link, useLocation } from "react-router-dom";
import type { AppointmentSummary, BookingContact } from "../../lib/api";
import { formatMoney } from "../../lib/bookingFormat";

interface ConfirmedState {
  appointmentId: string;
  bookingReference: string;
  clientId: string;
  contact: BookingContact;
  summary: AppointmentSummary;
}

export default function BookingConfirmed() {
  const location = useLocation();
  const state = location.state as ConfirmedState | undefined;

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

  const { summary, contact, appointmentId, bookingReference } = state;

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

  return (
    <div className="kaaya-shell">
      <div className="kaaya-header">
        <h1>Kaaya</h1>
        <p>Booking confirmed</p>
      </div>

      <div className="kaaya-card">
        <p>Your appointment is booked. We look forward to seeing you.</p>
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
          </tbody>
        </table>
      </div>

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
