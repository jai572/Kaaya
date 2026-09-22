import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import {
  staffListStaffMembers,
  staffCreateStaffMember,
  staffUpdateStaffMember,
  staffGetStaffWorkingHours,
  staffSetStaffWorkingHours,
  type StaffMemberRow,
  type WorkingHoursBlock,
} from "../../lib/api";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function emptyWeek(): WorkingHoursBlock[] {
  return DAY_LABELS.map((_, day_of_week) => ({ day_of_week, start_time: null, end_time: null }));
}

export default function StaffMembers() {
  const navigate = useNavigate();
  const [staffMembers, setStaffMembers] = useState<StaffMemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [week, setWeek] = useState<WorkingHoursBlock[]>(emptyWeek());
  const [savingHours, setSavingHours] = useState(false);

  function load() {
    staffListStaffMembers()
      .then((res) => setStaffMembers(res.staffMembers))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load staff members"));
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/staff/login");
        return;
      }
      load();
    });
  }, [navigate]);

  async function createStaffMember() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await staffCreateStaffMember({ display_name: newName.trim() });
      setNewName("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create staff member");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(member: StaffMemberRow) {
    try {
      await staffUpdateStaffMember(member.id, { active: !member.active });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update staff member");
    }
  }

  async function openHours(memberId: string) {
    if (expandedId === memberId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(memberId);
    try {
      const { hours } = await staffGetStaffWorkingHours(memberId);
      const byDay = new Map(hours.map((h) => [h.day_of_week, h]));
      setWeek(
        DAY_LABELS.map((_, day_of_week) => {
          const existing = byDay.get(day_of_week);
          return { day_of_week, start_time: existing?.start_time ?? null, end_time: existing?.end_time ?? null };
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load working hours");
    }
  }

  async function saveHours(memberId: string) {
    setSavingHours(true);
    setError(null);
    try {
      await staffSetStaffWorkingHours(memberId, week);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save working hours");
    } finally {
      setSavingHours(false);
    }
  }

  return (
    <div className="kaaya-shell kaaya-shell--wide">
      <div className="kaaya-header">
        <h1>Kaaya — Staff members</h1>
        <p>Therapists who perform treatments, and their weekly working hours.</p>
      </div>

      <p>
        <Link to="/staff">← Back to consultations</Link> · <Link to="/staff/services">Services</Link> ·{" "}
        <Link to="/staff/bookings">Bookings</Link>
      </p>

      {error && <p className="kaaya-error">{error}</p>}

      <div className="kaaya-card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Add a staff member</h2>
        <div className="kaaya-field">
          <label htmlFor="new-staff-name">Display name</label>
          <input id="new-staff-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <button type="button" className="kaaya-btn kaaya-btn--secondary" disabled={creating} onClick={createStaffMember}>
          {creating ? "Adding…" : "Add staff member"}
        </button>
      </div>

      {staffMembers && (
        <div className="kaaya-card">
          {staffMembers.map((member) => (
            <div key={member.id} style={{ borderBottom: "1px solid var(--kaaya-border)", padding: "14px 0" }}>
              <strong>{member.display_name}</strong>
              {!member.active && (
                <span className="kaaya-badge kaaya-badge--INFORMATION" style={{ marginLeft: 8 }}>
                  Inactive
                </span>
              )}
              <div className="kaaya-btn-row" style={{ marginTop: 8 }}>
                <button type="button" className="kaaya-btn kaaya-btn--secondary" onClick={() => openHours(member.id)}>
                  {expandedId === member.id ? "Hide hours" : "Edit working hours"}
                </button>
                <button type="button" className="kaaya-btn kaaya-btn--secondary" onClick={() => toggleActive(member)}>
                  {member.active ? "Deactivate" : "Reactivate"}
                </button>
              </div>

              {expandedId === member.id && (
                <div style={{ marginTop: 12 }}>
                  {week.map((block) => (
                    <div key={block.day_of_week} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 90 }}>{DAY_LABELS[block.day_of_week]}</span>
                      <input
                        type="time"
                        value={block.start_time ?? ""}
                        onChange={(e) =>
                          setWeek((w) =>
                            w.map((b) => (b.day_of_week === block.day_of_week ? { ...b, start_time: e.target.value || null } : b))
                          )
                        }
                      />
                      <span>to</span>
                      <input
                        type="time"
                        value={block.end_time ?? ""}
                        onChange={(e) =>
                          setWeek((w) =>
                            w.map((b) => (b.day_of_week === block.day_of_week ? { ...b, end_time: e.target.value || null } : b))
                          )
                        }
                      />
                      <button
                        type="button"
                        className="kaaya-btn kaaya-btn--secondary"
                        onClick={() =>
                          setWeek((w) =>
                            w.map((b) => (b.day_of_week === block.day_of_week ? { ...b, start_time: null, end_time: null } : b))
                          )
                        }
                      >
                        Not working
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="kaaya-btn"
                    disabled={savingHours}
                    onClick={() => saveHours(member.id)}
                  >
                    {savingHours ? "Saving…" : "Save hours"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
