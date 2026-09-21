import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import {
  staffListBookingServices,
  staffCreateServiceMapping,
  staffUpdateServiceMapping,
  type BookableService,
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
  treatmentId: string;
  tintProductType: "" | "hair_dye" | "other";
  eyelashSafe: "" | "inherit" | "yes" | "no";
  notes: string;
};

function emptyEdit(service: BookableService): RowEdit {
  return {
    treatmentId: service.mapping?.treatment_id ?? "",
    tintProductType: "",
    eyelashSafe: "inherit",
    notes: "",
  };
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null || !currency) return "Price on request";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount / 100);
}

export default function StaffServiceMappings() {
  const navigate = useNavigate();
  const [services, setServices] = useState<BookableService[] | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/staff/login");
        return;
      }
      staffListBookingServices()
        .then((res) => {
          setServices(res.services);
          setTreatments(res.treatments);
          setEdits(Object.fromEntries(res.services.map((s) => [s.squareVariationId, emptyEdit(s)])));
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load services"));
    });
  }, [navigate]);

  function updateEdit(variationId: string, patch: Partial<RowEdit>) {
    setEdits((prev) => ({ ...prev, [variationId]: { ...prev[variationId], ...patch } }));
  }

  async function saveMapping(service: BookableService) {
    const edit = edits[service.squareVariationId];
    if (!edit || !edit.treatmentId) return;
    setSavingId(service.squareVariationId);
    setSavedId(null);
    setError(null);
    try {
      const input = {
        square_item_id: service.squareItemId,
        square_variation_id: service.squareVariationId,
        treatment_id: edit.treatmentId,
        tint_product_type: edit.tintProductType || null,
        eyelash_safe: edit.eyelashSafe === "yes" ? true : edit.eyelashSafe === "no" ? false : null,
        notes: edit.notes || undefined,
      };
      if (service.mapping) {
        await staffUpdateServiceMapping(service.squareVariationId, input);
      } else {
        await staffCreateServiceMapping(input);
      }
      setSavedId(service.squareVariationId);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save mapping";
      if (message.toLowerCase().includes("insufficient role")) setReadOnly(true);
      setError(message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="kaaya-shell kaaya-shell--wide">
      <div className="kaaya-header">
        <h1>Kaaya — Square service mappings</h1>
        <p>Link each bookable Square service to a Kaaya screening treatment.</p>
      </div>

      <p>
        <Link to="/staff">← Back to consultations</Link>
      </p>

      {readOnly && (
        <p className="kaaya-error">
          Your account can view mappings but not change them — ask an admin to make edits.
        </p>
      )}
      {error && <p className="kaaya-error">{error}</p>}

      {services && (
        <div className="kaaya-card">
          {services.length === 0 && <p>No bookable Square services found.</p>}
          {services.map((service) => {
            const edit = edits[service.squareVariationId];
            const selectedTreatment = treatments.find((t) => t.id === edit?.treatmentId);
            return (
              <div
                key={service.squareVariationId}
                style={{ borderBottom: "1px solid var(--kaaya-border)", padding: "14px 0" }}
              >
                <strong>
                  {service.serviceName} — {service.variationName}
                </strong>
                <div style={{ color: "var(--kaaya-text-muted)", fontSize: "0.85rem", marginBottom: 8 }}>
                  {formatMoney(service.priceAmount, service.priceCurrency)}
                  {service.durationMinutes ? ` · ${service.durationMinutes} min` : ""}
                </div>

                <div className="kaaya-field">
                  <label htmlFor={`treatment-${service.squareVariationId}`}>Kaaya screening treatment</label>
                  <select
                    id={`treatment-${service.squareVariationId}`}
                    value={edit?.treatmentId ?? ""}
                    disabled={readOnly}
                    onChange={(e) => updateEdit(service.squareVariationId, { treatmentId: e.target.value })}
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
                    <label htmlFor={`tint-${service.squareVariationId}`}>Tint product type</label>
                    <select
                      id={`tint-${service.squareVariationId}`}
                      value={edit?.tintProductType ?? ""}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateEdit(service.squareVariationId, {
                          tintProductType: e.target.value as RowEdit["tintProductType"],
                        })
                      }
                    >
                      <option value="">Not set</option>
                      <option value="hair_dye">Hair dye</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                )}

                <div className="kaaya-field">
                  <label htmlFor={`eyelash-${service.squareVariationId}`}>Eyelash-safe</label>
                  <select
                    id={`eyelash-${service.squareVariationId}`}
                    value={edit?.eyelashSafe ?? "inherit"}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateEdit(service.squareVariationId, { eyelashSafe: e.target.value as RowEdit["eyelashSafe"] })
                    }
                  >
                    <option value="inherit">Inherit from treatment</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div className="kaaya-field">
                  <label htmlFor={`notes-${service.squareVariationId}`}>Notes</label>
                  <input
                    id={`notes-${service.squareVariationId}`}
                    type="text"
                    value={edit?.notes ?? ""}
                    disabled={readOnly}
                    onChange={(e) => updateEdit(service.squareVariationId, { notes: e.target.value })}
                  />
                </div>

                <button
                  type="button"
                  className="kaaya-btn kaaya-btn--secondary"
                  disabled={readOnly || !edit?.treatmentId || savingId === service.squareVariationId}
                  onClick={() => saveMapping(service)}
                >
                  {savingId === service.squareVariationId
                    ? "Saving…"
                    : savedId === service.squareVariationId
                      ? "Saved"
                      : "Save"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
