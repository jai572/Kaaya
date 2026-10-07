import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  staffDeleteDocument,
  staffDocumentLink,
  staffGetFile,
  staffSaveFile,
  staffUploadDocument,
  type StaffDocument,
  type StaffDocumentKind,
  type StaffRecord,
} from "../../lib/api";
import { clearedToWorkAlone } from "@shared/staffFiles";
import { PageHead, errorMessage } from "../../components/staff/ui";

const EMPTY: StaffRecord = {
  legal_name: null,
  date_of_birth: null,
  phone: null,
  email: null,
  address: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  beauty_experience_since: null,
  right_to_work_type: null,
  right_to_work_checked_on: null,
  right_to_work_expires_on: null,
  notes: null,
};

const RTW_LABEL: Record<string, string> = {
  british_irish_passport: "British or Irish passport",
  share_code: "Home Office share code (online check)",
  visa_or_permit: "Visa, eVisa or residence permit",
  other: "Other",
};

const KIND_LABEL: Record<StaffDocumentKind, string> = {
  id: "ID (passport, driving licence)",
  right_to_work: "Right to work / residence permit",
  cv: "CV",
  qualification: "Qualification / certificate",
  other: "Other",
};

const today = () => new Date().toISOString().slice(0, 10);

export default function StaffFileDetail() {
  const { staffMemberId } = useParams<{ staffMemberId: string }>();
  const [data, setData] = useState<Awaited<ReturnType<typeof staffGetFile>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<StaffRecord>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [upKind, setUpKind] = useState<StaffDocumentKind>("right_to_work");
  const [upLabel, setUpLabel] = useState("");
  const [upIssued, setUpIssued] = useState("");
  const [upExpires, setUpExpires] = useState("");
  const [upFile, setUpFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [upError, setUpError] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const load = useCallback(() => {
    staffGetFile(staffMemberId!)
      .then((res) => {
        setData(res);
        setForm({ ...EMPTY, ...(res.record ?? {}) });
      })
      .catch((e) => setError(errorMessage(e, "Could not load this staff file")));
  }, [staffMemberId]);

  useEffect(load, [load]);

  function set<K extends keyof StaffRecord>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value === "" ? null : value }));
    setSaveMsg(null);
  }

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await staffSaveFile(staffMemberId!, form);
      setSaveMsg("Saved");
      load();
    } catch (e) {
      setSaveMsg(errorMessage(e, "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  async function upload() {
    setUploading(true);
    setUpError(null);
    try {
      const fd = new FormData();
      fd.set("kind", upKind);
      fd.set("label", upLabel.trim() || KIND_LABEL[upKind]);
      fd.set("issued_on", upIssued);
      fd.set("expires_on", upExpires);
      if (upFile) fd.set("file", upFile);
      await staffUploadDocument(staffMemberId!, fd);
      setUpLabel("");
      setUpIssued("");
      setUpExpires("");
      setUpFile(null);
      setFileInputKey((k) => k + 1);
      load();
    } catch (e) {
      setUpError(errorMessage(e, "Could not upload"));
    } finally {
      setUploading(false);
    }
  }

  async function open(doc: StaffDocument) {
    try {
      const { url } = await staffDocumentLink(doc.id);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setUpError(errorMessage(e, "Could not open the file"));
    }
  }

  async function remove(doc: StaffDocument) {
    if (!window.confirm(`Delete "${doc.label}"? This can't be undone.`)) return;
    try {
      await staffDeleteDocument(doc.id);
      load();
    } catch (e) {
      setUpError(errorMessage(e, "Could not delete"));
    }
  }

  const cleared = clearedToWorkAlone(form, today());
  const field = (key: keyof StaffRecord, label: string, type = "text") => (
    <div className="st-field">
      <label htmlFor={`sf-${key}`}>{label}</label>
      <input id={`sf-${key}`} className="st-input" type={type} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  return (
    <div className="st-page">
      <PageHead
        title={data ? data.member.display_name : "Staff file"}
        subtitle="Private staff file"
        actions={<Link to="/staff/files">← Staff files</Link>}
      />
      {error && <p className="st-error">{error}</p>}

      {data && (
        <>
          {data.alerts.length > 0 && (
            <div className="st-card">
              <div className="st-card-body">
                {data.alerts.map((a) => (
                  <div key={a}>
                    <span className="st-chip st-chip--warn">{a}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="st-card">
            <div className="st-card-head">
              <h2>Personal and contact</h2>
            </div>
            <div className="st-card-body">
              <div className="st-grid-2">
                {field("legal_name", "Full legal name")}
                {field("date_of_birth", "Date of birth", "date")}
                {field("phone", "Phone", "tel")}
                {field("email", "Personal email", "email")}
              </div>
              <div className="st-field">
                <label htmlFor="sf-address">Home address</label>
                <textarea id="sf-address" className="st-input" rows={3} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div className="st-grid-2">
                {field("emergency_contact_name", "Emergency contact name")}
                {field("emergency_contact_phone", "Emergency contact phone", "tel")}
              </div>
            </div>
          </div>

          <div className="st-card">
            <div className="st-card-head">
              <h2>Right to work</h2>
            </div>
            <div className="st-card-body">
              <div className="st-grid-3">
                <div className="st-field">
                  <label htmlFor="sf-rtw">Checked using</label>
                  <select id="sf-rtw" className="st-input" value={form.right_to_work_type ?? ""} onChange={(e) => set("right_to_work_type", e.target.value)}>
                    <option value="">Not recorded</option>
                    {Object.entries(RTW_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                {field("right_to_work_checked_on", "Date checked", "date")}
                {field("right_to_work_expires_on", "Permission ends (if time-limited)", "date")}
              </div>
              <span className="st-hint">
                Upload a copy of what you checked below. Keep it for as long as they work here and 2 years after they leave.
              </span>
            </div>
          </div>

          <div className="st-card">
            <div className="st-card-head">
              <h2>Experience</h2>
            </div>
            <div className="st-card-body">
              <div className="st-grid-2">
                {field("beauty_experience_since", "Doing beauty treatments since", "date")}
                <div className="st-field">
                  <span className="st-label">Can work without supervision (insurance)</span>
                  <span>
                    {cleared === null ? (
                      <span className="st-chip">Add date of birth and experience</span>
                    ) : cleared ? (
                      <span className="st-chip st-chip--ok">Yes</span>
                    ) : (
                      <span className="st-chip st-chip--bad">No: must be supervised</span>
                    )}
                  </span>
                </div>
              </div>
              <span className="st-hint">Your insurer covers beauty work by someone 18 or over with more than one year's continuous experience, or anyone under their direct supervision.</span>
              <div className="st-field">
                <label htmlFor="sf-notes">Notes</label>
                <textarea id="sf-notes" className="st-input" rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
              </div>
              <div className="st-btn-row">
                {saveMsg && <span className={saveMsg === "Saved" ? "st-muted" : "st-error"}>{saveMsg}</span>}
                <button type="button" className="st-btn" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save details"}
                </button>
              </div>
            </div>
          </div>

          <div className="st-card">
            <div className="st-card-head">
              <h2>Documents</h2>
            </div>
            {data.documents.length === 0 ? (
              <p className="st-empty">No documents yet.</p>
            ) : (
              <div className="st-table-wrap">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Type</th>
                      <th>Expires</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documents.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {d.label}
                          {d.issued_on && <div className="st-muted">Issued {d.issued_on}</div>}
                        </td>
                        <td>{KIND_LABEL[d.kind]}</td>
                        <td className="st-num">{d.expires_on ?? "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {d.file_name ? (
                            <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={() => open(d)}>
                              Open
                            </button>
                          ) : (
                            <span className="st-muted">No file </span>
                          )}{" "}
                          <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={() => remove(d)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="st-card-body">
              <h3 style={{ marginTop: 0, fontSize: "1rem" }}>Add a document</h3>
              <div className="st-grid-2">
                <div className="st-field">
                  <label htmlFor="up-kind">Type</label>
                  <select id="up-kind" className="st-input" value={upKind} onChange={(e) => setUpKind(e.target.value as StaffDocumentKind)}>
                    {Object.entries(KIND_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="st-field">
                  <label htmlFor="up-label">Name</label>
                  <input
                    id="up-label"
                    className="st-input"
                    placeholder={upKind === "qualification" ? "e.g. Level 3 Lash & Brow" : KIND_LABEL[upKind]}
                    value={upLabel}
                    onChange={(e) => setUpLabel(e.target.value)}
                  />
                </div>
                <div className="st-field">
                  <label htmlFor="up-issued">Issued / achieved</label>
                  <input id="up-issued" className="st-input" type="date" value={upIssued} onChange={(e) => setUpIssued(e.target.value)} />
                </div>
                <div className="st-field">
                  <label htmlFor="up-expires">Expires (if it does)</label>
                  <input id="up-expires" className="st-input" type="date" value={upExpires} onChange={(e) => setUpExpires(e.target.value)} />
                </div>
              </div>
              <div className="st-field">
                <label htmlFor="up-file">File (PDF, photo or Word, 10MB max)</label>
                <input
                  key={fileInputKey}
                  id="up-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx"
                  onChange={(e) => setUpFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {upError && <p className="st-error">{upError}</p>}
              <div className="st-btn-row">
                <button type="button" className="st-btn" onClick={upload} disabled={uploading || (!upFile && upKind !== "qualification")}>
                  {uploading ? "Uploading…" : "Add document"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
