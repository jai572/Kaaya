import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import {
  staffListBookingServices,
  staffCreateService,
  staffUpdateService,
  staffListStaffMembers,
  staffGetServiceStaffCapabilities,
  staffSetServiceStaffCapabilities,
  type BookableService,
  type StaffMemberRow,
} from "../../lib/api";

type Treatment = {
  id: string;
  name: string;
  is_tint: boolean;
  is_eyelash: boolean;
  uses_adhesive: boolean;
  requires_patch_test: boolean;
};

type RowEdit = {
  name: string;
  priceInput: string; // pounds, as typed
  durationInput: string; // minutes, as typed
  treatmentId: string;
  tintProductType: "" | "hair_dye" | "other";
  eyelashSafe: "inherit" | "yes" | "no";
  notes: string;
  staffMemberIds: string[];
};

function toRowEdit(service: BookableService): RowEdit {
  return {
    name: service.name,
    priceInput: (service.price_amount / 100).toFixed(2),
    durationInput: service.duration_minutes ? String(service.duration_minutes) : "",
    treatmentId: service.treatment_id ?? "",
    tintProductType: service.tint_product_type ?? "",
    eyelashSafe: service.eyelash_safe === true ? "yes" : service.eyelash_safe === false ? "no" : "inherit",
    notes: "",
    staffMemberIds: [],
  };
}

export default function StaffServices() {
  const navigate = useNavigate();
  const [services, setServices] = useState<BookableService[] | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMemberRow[]>([]);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [newService, setNewService] = useState({ name: "", category_slug: "", priceInput: "" });
  const [creating, setCreating] = useState(false);

  function loadAll() {
    Promise.all([staffListBookingServices(), staffListStaffMembers()])
      .then(async ([servicesRes, staffRes]) => {
        setServices(servicesRes.services);
        setTreatments(servicesRes.treatments);
        setStaffMembers(staffRes.staffMembers);

        const capabilityEntries = await Promise.all(
          servicesRes.services.map(async (s) => {
            const { staffMemberIds } = await staffGetServiceStaffCapabilities(s.id);
            return [s.id, staffMemberIds] as const;
          })
        );
        const capabilityMap = Object.fromEntries(capabilityEntries);
        setEdits(
          Object.fromEntries(
            servicesRes.services.map((s) => [s.id, { ...toRowEdit(s), staffMemberIds: capabilityMap[s.id] ?? [] }])
          )
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load services"));
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/staff/login");
        return;
      }
      loadAll();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  function updateEdit(serviceId: string, patch: Partial<RowEdit>) {
    setEdits((prev) => ({ ...prev, [serviceId]: { ...prev[serviceId], ...patch } }));
  }

  async function saveService(service: BookableService) {
    const edit = edits[service.id];
    if (!edit) return;
    setSavingId(service.id);
    setSavedId(null);
    setError(null);
    try {
      await staffUpdateService(service.id, {
        name: edit.name,
        price_amount: Math.round(parseFloat(edit.priceInput || "0") * 100),
        duration_minutes: edit.durationInput ? parseInt(edit.durationInput, 10) : null,
        treatment_id: edit.treatmentId || null,
        tint_product_type: edit.tintProductType || null,
        eyelash_safe: edit.eyelashSafe === "yes" ? true : edit.eyelashSafe === "no" ? false : null,
      });
      await staffSetServiceStaffCapabilities(service.id, edit.staffMemberIds);
      setSavedId(service.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save service");
    } finally {
      setSavingId(null);
    }
  }

  async function createService() {
    if (!newService.name.trim() || !newService.category_slug.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await staffCreateService({
        name: newService.name.trim(),
        category_slug: newService.category_slug.trim(),
        price_amount: Math.round(parseFloat(newService.priceInput || "0") * 100),
      });
      setNewService({ name: "", category_slug: "", priceInput: "" });
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create service");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="kaaya-shell kaaya-shell--wide">
      <div className="kaaya-header">
        <h1>Kaaya — Services</h1>
        <p>Manage bookable treatments, prices and which staff can perform them.</p>
      </div>

      <p>
        <Link to="/staff">← Back to consultations</Link> · <Link to="/staff/staff-members">Staff members</Link> ·{" "}
        <Link to="/staff/bookings">Bookings</Link>
      </p>

      {error && <p className="kaaya-error">{error}</p>}

      <div className="kaaya-card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Add a new service</h2>
        <div className="kaaya-field">
          <label htmlFor="new-service-name">Name</label>
          <input
            id="new-service-name"
            type="text"
            value={newService.name}
            onChange={(e) => setNewService((s) => ({ ...s, name: e.target.value }))}
          />
        </div>
        <div className="kaaya-field">
          <label htmlFor="new-service-category">Category slug</label>
          <input
            id="new-service-category"
            type="text"
            value={newService.category_slug}
            onChange={(e) => setNewService((s) => ({ ...s, category_slug: e.target.value }))}
          />
        </div>
        <div className="kaaya-field">
          <label htmlFor="new-service-price">Price (£)</label>
          <input
            id="new-service-price"
            type="text"
            value={newService.priceInput}
            onChange={(e) => setNewService((s) => ({ ...s, priceInput: e.target.value }))}
          />
        </div>
        <button type="button" className="kaaya-btn kaaya-btn--secondary" disabled={creating} onClick={createService}>
          {creating ? "Adding…" : "Add service"}
        </button>
      </div>

      {services && (
        <div className="kaaya-card">
          {services.map((service) => {
            const edit = edits[service.id];
            const selectedTreatment = treatments.find((t) => t.id === edit?.treatmentId);
            return (
              <div key={service.id} style={{ borderBottom: "1px solid var(--kaaya-border)", padding: "14px 0" }}>
                <strong>{service.name}</strong>
                {!service.duration_minutes && (
                  <span className="kaaya-badge kaaya-badge--MEDIUM" style={{ marginLeft: 8 }}>
                    Duration not set
                  </span>
                )}
                <div style={{ color: "var(--kaaya-text-muted)", fontSize: "0.85rem", margin: "4px 0 8px" }}>
                  {service.category_slug}
                </div>

                <div className="kaaya-field">
                  <label htmlFor={`price-${service.id}`}>Price (£)</label>
                  <input
                    id={`price-${service.id}`}
                    type="text"
                    value={edit?.priceInput ?? ""}
                    onChange={(e) => updateEdit(service.id, { priceInput: e.target.value })}
                  />
                </div>

                <div className="kaaya-field">
                  <label htmlFor={`duration-${service.id}`}>Duration (minutes)</label>
                  <input
                    id={`duration-${service.id}`}
                    type="text"
                    placeholder="Not set"
                    value={edit?.durationInput ?? ""}
                    onChange={(e) => updateEdit(service.id, { durationInput: e.target.value })}
                  />
                </div>

                <div className="kaaya-field">
                  <label htmlFor={`treatment-${service.id}`}>Kaaya screening treatment</label>
                  <select
                    id={`treatment-${service.id}`}
                    value={edit?.treatmentId ?? ""}
                    onChange={(e) => updateEdit(service.id, { treatmentId: e.target.value })}
                  >
                    <option value="">Not mapped</option>
                    {treatments.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTreatment?.is_tint && (
                  <div className="kaaya-field">
                    <label htmlFor={`tint-${service.id}`}>Tint product type</label>
                    <select
                      id={`tint-${service.id}`}
                      value={edit?.tintProductType ?? ""}
                      onChange={(e) => updateEdit(service.id, { tintProductType: e.target.value as RowEdit["tintProductType"] })}
                    >
                      <option value="">Not set</option>
                      <option value="hair_dye">Hair dye</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                )}

                <div className="kaaya-field">
                  <label htmlFor={`eyelash-${service.id}`}>Eyelash-safe</label>
                  <select
                    id={`eyelash-${service.id}`}
                    value={edit?.eyelashSafe ?? "inherit"}
                    onChange={(e) => updateEdit(service.id, { eyelashSafe: e.target.value as RowEdit["eyelashSafe"] })}
                  >
                    <option value="inherit">Inherit from treatment</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div className="kaaya-field">
                  <label>Staff who can perform this service</label>
                  {staffMembers.map((m) => (
                    <label key={m.id} className="kaaya-checkbox-row">
                      <input
                        type="checkbox"
                        checked={edit?.staffMemberIds.includes(m.id) ?? false}
                        onChange={(e) => {
                          const ids = new Set(edit?.staffMemberIds ?? []);
                          if (e.target.checked) ids.add(m.id);
                          else ids.delete(m.id);
                          updateEdit(service.id, { staffMemberIds: Array.from(ids) });
                        }}
                      />
                      <span>{m.display_name}</span>
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  className="kaaya-btn kaaya-btn--secondary"
                  disabled={savingId === service.id}
                  onClick={() => saveService(service)}
                >
                  {savingId === service.id ? "Saving…" : savedId === service.id ? "Saved" : "Save"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
