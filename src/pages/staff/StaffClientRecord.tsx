import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { staffGetClientRecord, type ClientRecord, type AppointmentStatus } from "../../lib/api";
import { formatMoney } from "../../lib/bookingFormat";

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

export default function StaffClientRecord() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<ClientRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/staff/login");
        return;
      }
      staffGetClientRecord(clientId!)
        .then(setRecord)
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load this client"));
    });
  }, [navigate, clientId]);

  return (
    <div className="kaaya-shell kaaya-shell--wide">
      <div className="kaaya-header">
        <h1>Kaaya — Client record</h1>
      </div>
      <p>
        <Link to="/staff/bookings">← Back to bookings</Link> · <Link to="/staff">Consultations</Link>
      </p>

      {error && <p className="kaaya-error">{error}</p>}

      {record && (
        <>
          <div className="kaaya-card">
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>
              {record.client.first_name} {record.client.last_name}
            </h2>
            <p style={{ color: "var(--kaaya-text-muted)", margin: 0 }}>
              {record.client.email} · {record.client.phone}
            </p>
          </div>

          <div className="kaaya-card">
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Appointments</h2>
            {record.appointments.length === 0 && <p>No appointments yet.</p>}
            {record.appointments.map((a) => (
              <div key={a.id} style={{ borderBottom: "1px solid var(--kaaya-border)", padding: "10px 0" }}>
                <strong>
                  {new Date(a.scheduled_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>
                <span style={{ marginLeft: 8 }}>{a.service_name}</span>
                <span style={{ marginLeft: 8, color: "var(--kaaya-text-muted)" }}>
                  {formatMoney(a.price_amount, a.price_currency)}
                </span>
                <span className={`kaaya-badge kaaya-badge--${STATUS_BADGE[a.status]}`} style={{ marginLeft: 8 }}>
                  {STATUS_LABEL[a.status]}
                </span>
                {a.status === "rescheduled" && a.rescheduled_to_id && (
                  <div style={{ color: "var(--kaaya-text-muted)", fontSize: "0.85rem" }}>
                    Rescheduled to a new appointment below.
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="kaaya-card">
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Consultations</h2>
            {record.consultations.length === 0 && <p>No consultations yet.</p>}
            {record.consultations.map((c) => (
              <Link key={c.id} to={`/staff/consultations/${c.id}`} className="kaaya-list-row" style={{ padding: "10px 0" }}>
                <strong>{c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : "Draft"}</strong>
                <span style={{ marginLeft: 8, color: "var(--kaaya-text-muted)" }}>{c.status.replace(/_/g, " ")}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
