import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { staffGetConsultation, staffRecordReview } from "../../lib/api";
import type { Severity } from "@shared/types";

type Flag = {
  id: string;
  severity: Severity;
  category: string | null;
  title: string;
  client_answer_summary: string;
  explanation: string;
  staff_action: string;
  treatment_ids: string[];
  group_key: string | null;
};

type Answer = {
  section: string;
  question_key: string;
  question_label: string;
  answer_value: boolean | string;
  additional_info: string | null;
};

type ValidityStatus = "current" | "due_for_renewal" | "expired" | "superseded" | "unknown";

type Acknowledgement = {
  client_decision: "continue" | "decline";
  flag_ids: string[];
  acknowledged_at: string;
};

type Detail = {
  id: string;
  status: string;
  version: number;
  submitted_at: string | null;
  locked_at: string | null;
  valid_until: string | null;
  validity_status: ValidityStatus;
  supersedes_consultation_id: string | null;
  superseded_by_consultation_id: string | null;
  clients: { first_name: string; last_name: string; email: string; phone: string; address: string | null } | null;
  treatments: { id: string; name: string }[];
  answers: Answer[];
  flags: Flag[];
  signature: {
    legal_name: string;
    signature_value: string;
    method: "typed" | "drawn";
    is_provisional: boolean;
    consent_without_patch_test: boolean;
    signed_at: string;
    declaration_version: number;
  } | null;
  staff_reviews: { id: string; decision: string; notes: string | null; decided_at: string; staff_profiles: { full_name: string } | null }[];
  acknowledgement: Acknowledgement | null;
};

const DECISIONS = [
  { value: "suitable_to_proceed", label: "Suitable to proceed" },
  { value: "proceed_with_conditions", label: "Proceed subject to conditions" },
  { value: "further_information_required", label: "Further information required" },
  { value: "do_not_proceed", label: "Do not proceed" },
];

const VALIDITY_LABEL: Record<ValidityStatus, string> = {
  current: "Current",
  due_for_renewal: "Due for renewal",
  expired: "Expired",
  superseded: "Superseded",
  unknown: "Unknown",
};

const VALIDITY_SEVERITY: Record<ValidityStatus, Severity | null> = {
  current: null,
  due_for_renewal: "MEDIUM",
  expired: "HIGH",
  superseded: null,
  unknown: null,
};

const GROUP_LABEL: Record<string, string> = {
  patch_test: "Patch-test review required",
};

const SEVERITY_RANK: Record<Severity, number> = { HIGH: 3, MEDIUM: 2, INFORMATION: 1 };

// A flag is either shown on its own, or merged with others sharing the same
// group_key so the staff UI doesn't show two visually identical HIGH cards
// for what's really one topic (e.g. "patch test not recorded" +
// "consented to skip it" both surface under one "Patch-test review required").
type DisplayItem = { key: string; severity: Severity; title: string; members: Flag[] };

function groupFlags(flags: Flag[]): DisplayItem[] {
  const grouped = new Map<string, Flag[]>();
  const solo: Flag[] = [];

  for (const f of flags) {
    if (f.group_key) {
      const list = grouped.get(f.group_key) ?? [];
      list.push(f);
      grouped.set(f.group_key, list);
    } else {
      solo.push(f);
    }
  }

  const items: DisplayItem[] = solo.map((f) => ({ key: f.id, severity: f.severity, title: f.title, members: [f] }));
  for (const [groupKey, members] of grouped) {
    const severity = members.reduce((a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a] ? b.severity : a), members[0].severity);
    items.push({ key: groupKey, severity, title: GROUP_LABEL[groupKey] ?? groupKey, members });
  }
  return items.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

function FlagGroup({ item, expanded, onToggle }: { item: DisplayItem; expanded: boolean; onToggle: () => void }) {
  return (
    <div className={`kaaya-flag kaaya-flag--${item.severity}`}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={onToggle}
      >
        <span>
          <span className={`kaaya-badge kaaya-badge--${item.severity}`}>{item.severity}</span> <strong>{item.title}</strong>
        </span>
        <span>{expanded ? "−" : "+"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, fontSize: "0.9rem" }}>
          {item.members.length > 1 && (
            <p>
              <strong>Reasons:</strong>
            </p>
          )}
          {item.members.map((flag) => (
            <div key={flag.id} style={{ marginBottom: item.members.length > 1 ? 10 : 0 }}>
              {item.members.length > 1 && <p style={{ margin: "4px 0" }}>• {flag.title}</p>}
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
          ))}
        </div>
      )}
    </div>
  );
}

export default function StaffConsultationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    if (!id) return;
    staffGetConsultation(id)
      .then((res) => setData(res as Detail))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load consultation"));
  }

  // TEMPORARY (2026-09-18, requested for easier testing): login gate removed.
  // TO RE-ENABLE: restore the supabase.auth.getSession() check that redirected
  // to /staff/login before calling load().
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !decision || !confirmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await staffRecordReview(id, decision, confirmed, notes || undefined);
      setNotes("");
      setDecision("");
      setConfirmed(false);
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

  const generalFlags = data.flags.filter((f) => f.treatment_ids.length === 0);
  const generalGroups = groupFlags(generalFlags);
  const totalAttentionItems = groupFlags(data.flags).length;
  const validitySeverity = VALIDITY_SEVERITY[data.validity_status];

  return (
    <div className="kaaya-shell kaaya-shell--wide">
      <div className="kaaya-header" style={{ textAlign: "left" }}>
        <h1>{data.clients ? `${data.clients.first_name} ${data.clients.last_name}` : "Unknown client"}</h1>
        <p>
          {data.clients?.email} · {data.clients?.phone}
        </p>
        <p style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>
            Consultation version {data.version} · Submitted{" "}
            {data.submitted_at ? new Date(data.submitted_at).toLocaleDateString() : "—"}
          </span>
          <span className={validitySeverity ? `kaaya-badge kaaya-badge--${validitySeverity}` : "kaaya-badge"}>
            {VALIDITY_LABEL[data.validity_status]}
          </span>
        </p>
        {data.valid_until && (
          <p style={{ fontSize: "0.85rem", color: "var(--kaaya-text-muted)" }}>
            Renewal due {new Date(data.valid_until).toLocaleDateString()}
          </p>
        )}
        {data.supersedes_consultation_id && (
          <p style={{ fontSize: "0.85rem" }}>
            Supersedes a previous consultation —{" "}
            <Link to={`/staff/consultations/${data.supersedes_consultation_id}`}>view previous version</Link>
          </p>
        )}
        {data.superseded_by_consultation_id && (
          <p style={{ fontSize: "0.85rem" }}>
            A newer consultation exists —{" "}
            <Link to={`/staff/consultations/${data.superseded_by_consultation_id}`}>view latest version</Link>
          </p>
        )}
      </div>

      <div className="kaaya-card">
        <h2 style={{ marginTop: 0 }}>Client acknowledgement</h2>
        {data.acknowledgement ? (
          <>
            <p style={{ margin: "4px 0" }}>✓ Client reviewed identified attention items</p>
            <p style={{ margin: "4px 0" }}>✓ Client acknowledged the information</p>
            <p style={{ margin: "4px 0" }}>
              {data.acknowledgement.client_decision === "continue" ? (
                <>✓ Client wishes to continue with their appointment</>
              ) : (
                <span className="kaaya-badge kaaya-badge--HIGH">✗ Client does not wish to proceed</span>
              )}
            </p>
            <p style={{ fontSize: "0.85rem", color: "var(--kaaya-text-muted)", marginTop: 10 }}>
              Acknowledged {new Date(data.acknowledgement.acknowledged_at).toLocaleString()}. The client's decision
              does not remove any outstanding requirement below — staff must still follow Kaaya's treatment policy.
            </p>
          </>
        ) : (
          <p style={{ color: "var(--kaaya-text-muted)" }}>
            Not yet completed — the client has not acknowledged their flags or signed.
          </p>
        )}
      </div>

      <div className="kaaya-card">
        <h2 style={{ marginTop: 0 }}>Pre-treatment review</h2>
        <p style={{ color: "var(--kaaya-text-muted)" }}>
          {data.treatments.length} treatment{data.treatments.length === 1 ? "" : "s"} selected
          {totalAttentionItems > 0
            ? ` · ${totalAttentionItems} attention item${totalAttentionItems === 1 ? "" : "s"}`
            : " · no automated attention identified"}
        </p>

        {data.treatments.map((treatment) => {
          const treatmentFlags = data.flags.filter((f) => f.treatment_ids.includes(treatment.id));
          const items = groupFlags(treatmentFlags);
          return (
            <div key={treatment.id} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>{treatment.name}</h3>
              {items.length === 0 ? (
                <p style={{ color: "var(--kaaya-text-muted)", fontSize: "0.9rem" }}>No automated attention identified.</p>
              ) : (
                items.map((item) => (
                  <FlagGroup key={item.key} item={item} expanded={expanded.has(item.key)} onToggle={() => toggle(item.key)} />
                ))
              )}
            </div>
          );
        })}

        {generalGroups.length > 0 && (
          <div>
            <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>General</h3>
            {generalGroups.map((item) => (
              <FlagGroup key={item.key} item={item} expanded={expanded.has(item.key)} onToggle={() => toggle(item.key)} />
            ))}
          </div>
        )}
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
          <div style={{ marginTop: 16 }}>
            <p>
              Signed by <strong>{data.signature.legal_name}</strong> on{" "}
              {new Date(data.signature.signed_at).toLocaleString()}
              {data.signature.is_provisional && " (legal status pending business confirmation)"}
            </p>
            {data.signature.method === "drawn" ? (
              <img
                src={data.signature.signature_value}
                alt={`Signature of ${data.signature.legal_name}`}
                style={{ maxWidth: 300, border: "1px solid var(--kaaya-border)", borderRadius: 8, background: "#fff" }}
              />
            ) : (
              <p style={{ fontStyle: "italic", color: "var(--kaaya-text-muted)" }}>
                Typed signature: {data.signature.signature_value}
              </p>
            )}
          </div>
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
          <label className="kaaya-checkbox-row">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I have reviewed the attention items and original responses above, and confirm this decision.</span>
          </label>
          {error && <p className="kaaya-error">{error}</p>}
          <button className="kaaya-btn" type="submit" disabled={submitting || !decision || !confirmed}>
            {submitting ? "Saving…" : "Record decision"}
          </button>
        </form>
      </div>
    </div>
  );
}
