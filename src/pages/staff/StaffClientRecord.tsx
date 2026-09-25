import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { staffGetClientRecord, staffUpdateClient, type ClientRecord } from "../../lib/api";
import { formatMoney } from "../../lib/bookingFormat";
import { PageHead, errorMessage } from "../../components/staff/ui";
import { STATUS_CHIP, STATUS_LABEL } from "./calendar/shared";

export default function StaffClientRecord() {
  const { clientId } = useParams<{ clientId: string }>();
  const [record, setRecord] = useState<ClientRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    staffGetClientRecord(clientId!)
      .then(setRecord)
      .catch((e) => setError(errorMessage(e, "Could not load this client")));
  }, [clientId]);

  useEffect(load, [load]);

  function startEdit() {
    if (!record) return;
    const c = record.client;
    setForm({ first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email ?? "" });
    setSaveError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await staffUpdateClient(clientId!, { ...form, email: form.email.trim() || null });
      setEditing(false);
      load();
    } catch (e) {
      setSaveError(errorMessage(e, "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  const c = record?.client;
  return (
    <div className="st-page">
      <PageHead
        title={c ? `${c.first_name} ${c.last_name}`.trim() : "Client"}
        subtitle="Contact details, appointments and consultation forms"
        actions={<Link to="/staff/calendar">← Calendar</Link>}
      />
      {error && <p className="st-error">{error}</p>}

      {c && (
        <div className="st-card">
          <div className="st-card-head">
            <h2>Details</h2>
            {!editing && (
              <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={startEdit}>
                Edit details
              </button>
            )}
          </div>
          <div className="st-card-body">
            {editing ? (
              <>
                <div className="st-grid-2">
                  <div className="st-field">
                    <label htmlFor="cr-first">First name</label>
                    <input id="cr-first" className="st-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                  </div>
                  <div className="st-field">
                    <label htmlFor="cr-last">Last name</label>
                    <input id="cr-last" className="st-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                  </div>
                  <div className="st-field">
                    <label htmlFor="cr-phone">Phone</label>
                    <input id="cr-phone" className="st-input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="st-field">
                    <label htmlFor="cr-email">Email (optional)</label>
                    <input id="cr-email" className="st-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>
                {saveError && <p className="st-error">{saveError}</p>}
                <div className="st-btn-row">
                  <button type="button" className="st-btn st-btn--ghost" onClick={() => setEditing(false)} disabled={saving}>
                    Cancel
                  </button>
                  <button type="button" className="st-btn" onClick={save} disabled={saving || !form.first_name.trim() || form.phone.trim().length < 5}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            ) : (
              <dl className="st-panel-dl">
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${c.phone.replace(/\s+/g, "")}`}>{c.phone}</a>
                </dd>
                <dt>Email</dt>
                <dd>{c.email ?? <span className="st-muted">Not given</span>}</dd>
              </dl>
            )}
            <span className="st-hint">
              Online booking and consultation forms never change these details — if a client's number or name changes, update it here.
            </span>
          </div>
        </div>
      )}

      {record && (
        <div className="st-card">
          <div className="st-card-head">
            <h2>Appointments</h2>
          </div>
          {record.appointments.length === 0 ? (
            <p className="st-empty">No appointments yet.</p>
          ) : (
            <div className="st-table-wrap">
              <table className="st-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Treatment</th>
                    <th>Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...record.appointments].reverse().map((a) => (
                    <tr key={a.id}>
                      <td className="st-num">
                        {new Date(a.scheduled_at).toLocaleString("en-GB", {
                          timeZone: "Europe/London",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>{a.service_name}</td>
                      <td className="st-num">{formatMoney(a.price_amount, a.price_currency)}</td>
                      <td>
                        <span className={STATUS_CHIP[a.status]}>{STATUS_LABEL[a.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {record && (
        <div className="st-card">
          <div className="st-card-head">
            <h2>Consultation forms</h2>
          </div>
          {record.consultations.length === 0 ? (
            <p className="st-empty">No consultation forms yet.</p>
          ) : (
            record.consultations.map((f) => (
              <Link key={f.id} to={`/staff/consultations/${f.id}`} className="st-row-btn">
                <b>{f.submitted_at ? new Date(f.submitted_at).toLocaleDateString("en-GB") : "Draft"}</b>
                <span className="st-muted">{f.status.replace(/_/g, " ")}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
