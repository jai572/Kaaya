import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { staffListPermissions, staffSetPermissions, type FeatureKey, type StaffProfileRow } from "../../lib/api";

const FEATURE_LABELS: Record<FeatureKey, string> = {
  manage_services: "Manage services & prices",
  manage_staff_members: "Manage staff members & hours",
  manage_service_capability: "Assign staff to services",
  view_all_bookings: "View all bookings",
  manage_all_bookings: "Cancel any booking",
  view_revenue: "View revenue totals",
};

type OverrideState = "default" | "allow" | "deny";

export default function StaffPermissions() {
  const navigate = useNavigate();
  const [staffProfiles, setStaffProfiles] = useState<StaffProfileRow[] | null>(null);
  const [featureKeys, setFeatureKeys] = useState<FeatureKey[]>([]);
  const [grid, setGrid] = useState<Record<string, Record<FeatureKey, OverrideState>>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/staff/login");
        return;
      }
      staffListPermissions()
        .then((res) => {
          setStaffProfiles(res.staffProfiles);
          setFeatureKeys(res.featureKeys);
          const g: Record<string, Record<FeatureKey, OverrideState>> = {};
          for (const profile of res.staffProfiles) {
            g[profile.id] = Object.fromEntries(res.featureKeys.map((k) => [k, "default"])) as Record<
              FeatureKey,
              OverrideState
            >;
          }
          for (const override of res.overrides) {
            g[override.staff_profile_id][override.feature_key] = override.granted ? "allow" : "deny";
          }
          setGrid(g);
        })
        // A 403 here just means this account isn't the owner -- expected,
        // not an error worth alarming over.
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load permissions"));
    });
  }, [navigate]);

  async function save(staffProfileId: string) {
    setSavingId(staffProfileId);
    setError(null);
    try {
      const overrides = featureKeys.map((feature_key) => ({
        feature_key,
        granted: grid[staffProfileId][feature_key] === "default" ? null : grid[staffProfileId][feature_key] === "allow",
      }));
      await staffSetPermissions(staffProfileId, overrides);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save permissions");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="kaaya-shell kaaya-shell--wide">
      <div className="kaaya-header">
        <h1>Kaaya — Staff permissions</h1>
        <p>Owner only. Force-allow or force-deny individual capabilities per staff login, overriding their role.</p>
      </div>

      <p>
        <Link to="/staff">← Back to consultations</Link>
      </p>

      {error && <p className="kaaya-error">{error}</p>}

      {staffProfiles && (
        <div className="kaaya-card">
          {staffProfiles.map((profile) => (
            <div key={profile.id} style={{ borderBottom: "1px solid var(--kaaya-border)", padding: "14px 0" }}>
              <strong>{profile.full_name}</strong>
              <span style={{ marginLeft: 8, color: "var(--kaaya-text-muted)" }}>({profile.role})</span>

              {featureKeys.map((key) => (
                <div className="kaaya-field" key={key}>
                  <label htmlFor={`${profile.id}-${key}`}>{FEATURE_LABELS[key]}</label>
                  <select
                    id={`${profile.id}-${key}`}
                    value={grid[profile.id]?.[key] ?? "default"}
                    onChange={(e) =>
                      setGrid((g) => ({
                        ...g,
                        [profile.id]: { ...g[profile.id], [key]: e.target.value as OverrideState },
                      }))
                    }
                  >
                    <option value="default">Default (role-based)</option>
                    <option value="allow">Force allow</option>
                    <option value="deny">Force deny</option>
                  </select>
                </div>
              ))}

              <button
                type="button"
                className="kaaya-btn kaaya-btn--secondary"
                disabled={savingId === profile.id}
                onClick={() => save(profile.id)}
              >
                {savingId === profile.id ? "Saving…" : "Save"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
