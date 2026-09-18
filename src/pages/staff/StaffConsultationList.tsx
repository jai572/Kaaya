import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { staffListConsultations } from "../../lib/api";

type ValidityStatus = "current" | "due_for_renewal" | "expired" | "superseded" | "unknown";

type ListRow = {
  id: string;
  client_name: string;
  treatments: string[];
  submitted_at: string | null;
  status: string;
  flag_count: number;
  highest_severity: "HIGH" | "MEDIUM" | "INFORMATION" | null;
  latest_staff_decision: string | null;
  validity_status: ValidityStatus;
};

const VALIDITY_LABEL: Record<ValidityStatus, string> = {
  current: "Current",
  due_for_renewal: "Due for renewal",
  expired: "Expired",
  superseded: "Superseded",
  unknown: "Unknown",
};

const GRID_COLUMNS = "1.8fr 1.8fr 1fr 1.2fr 1fr 1.4fr 1.3fr";

export default function StaffConsultationList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // TEMPORARY (2026-09-18, requested for easier testing): login gate removed.
  // TO RE-ENABLE: restore the `if (!data.session) { navigate("/staff/login"); return; }`
  // check before calling staffListConsultations().
  useEffect(() => {
    staffListConsultations()
      .then((res) => setRows((res as { consultations: ListRow[] }).consultations))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load consultations"));
  }, [navigate]);

  return (
    <div className="kaaya-shell kaaya-shell--wide">
      <div className="kaaya-header">
        <h1>Kaaya — Consultations</h1>
      </div>
      {error && <p className="kaaya-error">{error}</p>}
      {rows && (
        <div className="kaaya-card">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID_COLUMNS,
              fontWeight: 700,
              fontSize: "0.85rem",
              padding: "10px",
              borderBottom: "1px solid var(--kaaya-border)",
            }}
          >
            <span>Client</span>
            <span>Treatment</span>
            <span>Submitted</span>
            <span>Status</span>
            <span>Flags</span>
            <span>Validity</span>
            <span>Review</span>
          </div>
          {rows.map((row) => (
            <Link
              key={row.id}
              to={`/staff/consultations/${row.id}`}
              className="kaaya-list-row"
              style={{
                display: "grid",
                gridTemplateColumns: GRID_COLUMNS,
                padding: "12px 10px",
                borderBottom: "1px solid var(--kaaya-border)",
                alignItems: "center",
                fontSize: "0.9rem",
              }}
            >
              <span>{row.client_name}</span>
              <span>{row.treatments.join(", ") || "—"}</span>
              <span>{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : "—"}</span>
              <span>{row.status.replace(/_/g, " ")}</span>
              <span>
                {row.flag_count > 0 ? (
                  <span className={`kaaya-badge kaaya-badge--${row.highest_severity}`}>
                    {row.flag_count} flag{row.flag_count === 1 ? "" : "s"}
                  </span>
                ) : (
                  "—"
                )}
              </span>
              <span>
                {row.validity_status === "expired" || row.validity_status === "due_for_renewal" ? (
                  <span
                    className={`kaaya-badge kaaya-badge--${row.validity_status === "expired" ? "HIGH" : "MEDIUM"}`}
                  >
                    {VALIDITY_LABEL[row.validity_status]}
                  </span>
                ) : (
                  VALIDITY_LABEL[row.validity_status]
                )}
              </span>
              <span>{row.latest_staff_decision?.replace(/_/g, " ") ?? "Pending review"}</span>
            </Link>
          ))}
          {rows.length === 0 && <p style={{ padding: 10 }}>No consultations yet.</p>}
        </div>
      )}
    </div>
  );
}
