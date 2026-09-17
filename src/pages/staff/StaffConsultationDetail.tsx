import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { staffGetConsultation, staffRecordReview } from "../../lib/api";
import type { Severity } from "@shared/types";

type Flag = {
  id: string;
  severity: Severity;
  title: string;
  client_answer_summary: string;
  explanation: string;
  staff_action: string;
};

type Answer = {
  section: string;
  question_key: string;
  question_label: string;
  answer_value: boolean | string;
  additional_info: string | null;
};

type Detail = {
  id: string;
  status: string;
  version: number;
  submitted_at: string | null;
  clients: { first_name: string; last_name: string; email: string; phone: string; address: string | null } | null;
  treatments: { id: string; name: string }[];
  answers: Answer[];
  flags: Flag[];
  signature: { legal_name: string; is_provisional: boolean; consent_without_patch_test: boolean; signed_at: string } | null;
  staff_reviews: { id: string; decision: string; notes: string | null; decided_at: string; staff_profiles: { full_name: string } | null }[];
};

const DECISIONS = [
  { value: "suitable_to_proceed", label: "Suitable to proceed" },
  { value: "proceed_with_conditions", label: "Proceed subject to conditions" },
  { value: "further_information_required", label: "Further information required" },
  { value: "do_not_proceed", label: "Do not proceed" },
];

export default function StaffConsultationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedFlag, setExpandedFlag] = useState<string | null>(null);
  const [decision, setDecision] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    if (!id) return;
    staffGetConsultation(id)
      .then((res) => setData(res as Detail))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load consultation"));
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!sessionData.session) {
        navigate("/staff/login");
        return;
      }
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate]);

  async function handleDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !decision) return;
    setSubmitting(true);
    setError(null);
    try {
      await staffRecordReview(id, decision, notes || undefined);
      setNotes("");
      setDecision("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record decision");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !data) {
    return (
      <div className="kaaya-shell">
        <p className="kaaya-error">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <div className="kaaya-shell">Loading…</div>;
  }

  return (
    <div className="kaaya-shell kaaya-shell--wide">
      <div className="kaaya-header" style={{ textAlign: "left" }}>
        <h1>{data.clients ? `${data.clients.first_name} ${data.clients.last_name}` : "Unknown client"}</h1>
        <p>
          {data.clients?.email} · {data.clients?.phone}
        </p>
        <p>Treatments: {data.treatments.map((t) => t.name).join(", ") || "—"}</p>
      </div>

      <div className="kaaya-card">
        <h2 style={{ marginTop: 0 }}>Pre-treatment review</h2>
        {data.flags.length === 0 && <p>No automated attention items identified.</p>}
        {data.flags.length > 0 && (
          <p>
            <strong>
              ⚠ {data.flags.length} attention item{data.flags.length === 1 ? "" : "s"} identified
            </strong>
          </p>
        )}
        {data.flags.map((flag) => (
          <div key={flag.id} className={`kaaya-flag kaaya-flag--${flag.severity}`}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              onClick={() => setExpandedFlag(expandedFlag === flag.id ? null : flag.id)}
            >
              <span>
                <span className={`kaaya-badge kaaya-badge--${flag.severity}`}>{flag.severity}</span>{" "}
                <strong>{flag.title}</strong>
              </span>
              <span>{expandedFlag === flag.id ? "−" : "+"}</span>
            </div>
            {expandedFlag === flag.id && (
              <div style={{ marginTop: 10, fontSize: "0.9rem" }}>
                <p>
                  <strong>Client answered:</strong> {flag.client_answer_summary}
                </p>
                <p>
                  <strong>Potential implication:</strong> {flag.explanation}
                </p>
                <p>
                  <strong>Staff should:</strong> {flag.staff_action}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="kaaya-card">
        <h2 style={{ marginTop: 0 }}>Original consultation responses</h2>
        {data.answers.map((a) => (
          <div key={a.question_key} className="kaaya-checkbox-row" style={{ justifyContent: "space-between" }}>
            <span>{a.question_label}</span>
            <span>
              <strong>{typeof a.answer_value === "boolean" ? (a.answer_value ? "Yes" : "No") : a.answer_value}</strong>
              {a.additional_info && (
                <span style={{ display: "block", color: "var(--kaaya-text-muted)", fontSize: "0.85rem" }}>
                  {a.additional_info}
                </span>
              )}
            </span>
          </div>
        ))}
        {data.signature && (
          <p style={{ marginTop: 16 }}>
            Signed by <strong>{data.signature.legal_name}</strong> on {new Date(data.signature.signed_at).toLocaleString()}
            {data.signature.is_provisional && " (typed signature — legal status pending business confirmation)"}
            {data.signature.consent_without_patch_test && " — consented to treatment without a patch test"}
          </p>
        )}
      </div>

      <div className="kaaya-card">
        <h2 style={{ marginTop: 0 }}>Staff decision</h2>
        {data.staff_reviews.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {data.staff_reviews.map((r) => (
              <p key={r.id} style={{ fontSize: "0.9rem", color: "var(--kaaya-text-muted)" }}>
                {r.decision.replace(/_/g, " ")} by {r.staff_profiles?.full_name ?? "staff"} on{" "}
                {new Date(r.decided_at).toLocaleString()}
                {r.notes && ` — ${r.notes}`}
              </p>
            ))}
          </div>
        )}
        <form onSubmit={handleDecision}>
          <div className="kaaya-field">
            <label htmlFor="decision">Decision</label>
            <select
              id="decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              required
              style={{ width: "100%", padding: 14, borderRadius: 10, border: "1px solid var(--kaaya-border)" }}
            >
              <option value="" disabled>
                Select a decision
              </option>
              {DECISIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="kaaya-field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="kaaya-error">{error}</p>}
          <button className="kaaya-btn" type="submit" disabled={submitting || !decision}>
            {submitting ? "Saving…" : "Record decision"}
          </button>
        </form>
      </div>
    </div>
  );
}
