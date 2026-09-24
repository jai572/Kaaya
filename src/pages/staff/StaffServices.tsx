import { useCallback, useEffect, useMemo, useState } from "react";
import {
  staffListBookingServices,
  staffCreateService,
  staffUpdateService,
  staffListStaffMembers,
  staffListServiceStaffLinks,
  staffSetServiceStaffCapabilities,
  type BookableService,
  type BookingMode,
  type StaffMemberRow,
} from "../../lib/api";
import { formatMoney, formatDuration } from "../../lib/bookingFormat";
import { categoryLabel, slugify, parsePriceToPence, penceToInput } from "../../lib/staffFormat";
import { Drawer, PageHead, Segmented, Switch, errorMessage } from "../../components/staff/ui";

type Treatment = {
  id: string;
  name: string;
  is_tint: boolean;
  is_eyelash: boolean;
  uses_adhesive: boolean;
  requires_patch_test: boolean;
};

const BOOKING_MODE_LABEL: Record<BookingMode, string> = {
  both: "Both",
  bookable_only: "Bookable only",
  walk_in_only: "Walk-in only",
};

const BOOKING_MODE_HINT: Record<BookingMode, string> = {
  both: "Clients can book online, and staff can add it for walk-ins.",
  bookable_only: "Clients can book online. Staff can still add it at the desk.",
  walk_in_only: "Shown on the booking page but not bookable online. Staff add it to an appointment.",
};

const NEW_CATEGORY = "__new__";

type Form = {
  id: string | null;
  category: string;
  newCategory: string;
  name: string;
  duration: string;
  price: string;
  priceIsFrom: boolean;
  bookingMode: BookingMode;
  treatmentId: string;
  tintProductType: "" | "hair_dye" | "other";
  eyelashSafe: "inherit" | "yes" | "no";
  active: boolean;
  staffIds: string[];
};

function formFromService(s: BookableService, staffIds: string[]): Form {
  return {
    id: s.id,
    category: s.category_slug,
    newCategory: "",
    name: s.name,
    duration: s.duration_minutes ? String(s.duration_minutes) : "",
    price: penceToInput(s.price_amount),
    priceIsFrom: s.price_is_from,
    bookingMode: s.booking_mode ?? "both",
    treatmentId: s.treatment_id ?? "",
    tintProductType: s.tint_product_type ?? "",
    eyelashSafe: s.eyelash_safe === true ? "yes" : s.eyelash_safe === false ? "no" : "inherit",
    active: s.active ?? true,
    staffIds,
  };
}

function emptyForm(category: string): Form {
  return {
    id: null,
    category: category || NEW_CATEGORY,
    newCategory: "",
    name: "",
    duration: "",
    price: "",
    priceIsFrom: false,
    bookingMode: "both",
    treatmentId: "",
    tintProductType: "",
    eyelashSafe: "inherit",
    active: true,
    staffIds: [],
  };
}

export default function StaffServices() {
  const [services, setServices] = useState<BookableService[] | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [staff, setStaff] = useState<StaffMemberRow[]>([]);
  const [links, setLinks] = useState<{ service_id: string; staff_member_id: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [svc, st, ln] = await Promise.all([staffListBookingServices(), staffListStaffMembers(), staffListServiceStaffLinks()]);
      setServices(svc.services);
      setTreatments(svc.treatments);
      setStaff(st.staffMembers);
      setLinks(ln.links);
    } catch (e) {
      setError(errorMessage(e, "Could not load services"));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const treatmentById = useMemo(() => new Map(treatments.map((t) => [t.id, t])), [treatments]);
  const staffById = useMemo(() => new Map(staff.map((m) => [m.id, m])), [staff]);

  const categories = useMemo(() => {
    const set = new Set((services ?? []).map((s) => s.category_slug));
    return [...set].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
  }, [services]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (services ?? []).filter(
      (s) => !q || s.name.toLowerCase().includes(q) || categoryLabel(s.category_slug).toLowerCase().includes(q)
    );
    return categories
      .map((c) => ({
        slug: c,
        items: list
          .filter((s) => s.category_slug === c)
          .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.items.length > 0);
  }, [services, categories, search]);

  function staffIdsFor(serviceId: string) {
    return links.filter((l) => l.service_id === serviceId).map((l) => l.staff_member_id);
  }

  function openEdit(s: BookableService) {
    setForm(formFromService(s, staffIdsFor(s.id)));
    setFormError(null);
  }

  function openNew() {
    setForm(emptyForm(categories[0] ?? ""));
    setFormError(null);
  }

  async function save() {
    if (!form) return;
    const categorySlug = form.category === NEW_CATEGORY ? slugify(form.newCategory) : form.category;
    const price = parsePriceToPence(form.price);
    const duration = form.duration.trim() ? parseInt(form.duration, 10) : null;

    if (!categorySlug) return setFormError("Choose or name a head treatment.");
    if (!form.name.trim()) return setFormError("Enter a treatment name.");
    if (price === null) return setFormError("Enter a price in pounds, e.g. 12 or 12.50.");
    if (duration !== null && (!Number.isInteger(duration) || duration < 1)) return setFormError("Duration must be a whole number of minutes.");
    if (duration === null && form.bookingMode !== "walk_in_only") return setFormError("Set a duration so the treatment can be booked.");

    const payload = {
      name: form.name.trim(),
      category_slug: categorySlug,
      price_amount: price,
      price_is_from: form.priceIsFrom,
      duration_minutes: duration,
      booking_mode: form.bookingMode,
      treatment_id: form.treatmentId || null,
      tint_product_type: form.tintProductType || null,
      eyelash_safe: form.eyelashSafe === "yes" ? true : form.eyelashSafe === "no" ? false : null,
    };

    setSaving(true);
    setFormError(null);
    try {
      let id = form.id;
      if (id) {
        await staffUpdateService(id, { ...payload, active: form.active });
      } else {
        id = (await staffCreateService(payload)).id;
        if (!form.active) await staffUpdateService(id, { active: false });
      }
      await staffSetServiceStaffCapabilities(id, form.staffIds);
      setForm(null);
      await load();
    } catch (e) {
      setFormError(errorMessage(e, "Could not save treatment"));
    } finally {
      setSaving(false);
    }
  }

  const mappedTreatment = form?.treatmentId ? treatmentById.get(form.treatmentId) : undefined;

  return (
    <div className="st-page">
      <PageHead
        title="Services"
        subtitle="Treatments, times and prices. Shared by all locations."
        actions={
          <>
            <input
              className="st-input"
              style={{ width: 220 }}
              type="search"
              placeholder="Search treatments"
              aria-label="Search treatments"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" className="st-btn" onClick={openNew}>
              + Add treatment
            </button>
          </>
        }
      />

      {error && <div className="st-error" role="alert">{error}</div>}

      <div className="st-card st-table-wrap">
        {services === null ? (
          <div className="st-empty">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="st-empty">No treatments match “{search}”.</div>
        ) : (
          <table className="st-table">
            <thead>
              <tr>
                <th>Treatment</th>
                <th>Time</th>
                <th>Price</th>
                <th>Patch test</th>
                <th>Online booking</th>
                <th>Staff</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows
                  key={g.slug}
                  label={categoryLabel(g.slug)}
                  items={g.items}
                  onOpen={openEdit}
                  patchTest={(s) => !!(s.treatment_id && treatmentById.get(s.treatment_id)?.requires_patch_test)}
                  staffFor={(s) => staffIdsFor(s.id).map((id) => staffById.get(id)).filter((m): m is StaffMemberRow => !!m)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <Drawer
          title={form.id ? "Edit treatment" : "Add treatment"}
          onClose={() => setForm(null)}
          footer={
            <>
              <button type="button" className="st-btn st-btn--ghost" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button type="button" className="st-btn" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save treatment"}
              </button>
            </>
          }
        >
          {formError && <div className="st-error" role="alert">{formError}</div>}

          <div className="st-field">
            <label htmlFor="svc-category">Head treatment</label>
            <select id="svc-category" className="st-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
              <option value={NEW_CATEGORY}>New head treatment…</option>
            </select>
            {form.category === NEW_CATEGORY && (
              <input
                aria-label="New head treatment name"
                className="st-input"
                placeholder="e.g. Tinting"
                value={form.newCategory}
                onChange={(e) => setForm({ ...form, newCategory: e.target.value })}
              />
            )}
          </div>

          <div className="st-field">
            <label htmlFor="svc-name">Treatment</label>
            <input id="svc-name" className="st-input" placeholder="e.g. Eyebrow shaping" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="st-grid-2">
            <div className="st-field">
              <label htmlFor="svc-duration">Duration (minutes)</label>
              <input id="svc-duration" className="st-input" inputMode="numeric" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
            </div>
            <div className="st-field">
              <label htmlFor="svc-price">Price (£)</label>
              <input id="svc-price" className="st-input" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <label className="st-check">
                <input type="checkbox" checked={form.priceIsFrom} onChange={(e) => setForm({ ...form, priceIsFrom: e.target.checked })} />
                Show as “from” price
              </label>
            </div>
          </div>

          <div className="st-field">
            <span className="st-label">Online booking</span>
            <Segmented<BookingMode>
              label="Online booking"
              value={form.bookingMode}
              onChange={(v) => setForm({ ...form, bookingMode: v })}
              options={(Object.keys(BOOKING_MODE_LABEL) as BookingMode[]).map((v) => ({ value: v, label: BOOKING_MODE_LABEL[v] }))}
            />
            <span className="st-hint">{BOOKING_MODE_HINT[form.bookingMode]}</span>
          </div>

          <div className="st-field">
            <label htmlFor="svc-screening">Consultation screening</label>
            <select id="svc-screening" className="st-select" value={form.treatmentId} onChange={(e) => setForm({ ...form, treatmentId: e.target.value })}>
              <option value="">None</option>
              {treatments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="st-hint">
              {mappedTreatment?.requires_patch_test ? (
                <span className="st-chip st-chip--warn">Patch test required</span>
              ) : (
                "Links this treatment to the consultation form’s safety questions. Patch test rules come from here."
              )}
            </span>
          </div>

          {(mappedTreatment?.is_tint || mappedTreatment?.is_eyelash) && (
            <div className="st-grid-2">
              {mappedTreatment?.is_tint && (
                <div className="st-field">
                  <label htmlFor="svc-tint">Tint product</label>
                  <select id="svc-tint" className="st-select" value={form.tintProductType} onChange={(e) => setForm({ ...form, tintProductType: e.target.value as Form["tintProductType"] })}>
                    <option value="">Not set</option>
                    <option value="hair_dye">Hair dye</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}
              <div className="st-field">
                <label htmlFor="svc-eyelash">Eyelash-safe</label>
                <select id="svc-eyelash" className="st-select" value={form.eyelashSafe} onChange={(e) => setForm({ ...form, eyelashSafe: e.target.value as Form["eyelashSafe"] })}>
                  <option value="inherit">As screening says</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
          )}

          <div className="st-field">
            <span className="st-label">Staff who do this treatment</span>
            {staff.length === 0 ? (
              <span className="st-hint">Add staff first.</span>
            ) : (
              <div className="st-pick-list">
                {staff
                  .filter((m) => m.active || form.staffIds.includes(m.id))
                  .map((m) => {
                    const on = form.staffIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className="st-pick"
                        aria-pressed={on}
                        onClick={() =>
                          setForm({ ...form, staffIds: on ? form.staffIds.filter((x) => x !== m.id) : [...form.staffIds, m.id] })
                        }
                      >
                        <span className="st-dot" style={{ ["--dot" as string]: m.colour ?? undefined }} />
                        {m.display_name}
                      </button>
                    );
                  })}
              </div>
            )}
            <span className="st-hint">Only these staff get online slots for it.</span>
          </div>

          <Switch
            id="svc-active"
            checked={form.active}
            onChange={(v) => setForm({ ...form, active: v })}
            label={form.active ? "Active" : "Hidden (not offered anywhere)"}
          />
        </Drawer>
      )}
    </div>
  );
}

function GroupRows({
  label,
  items,
  onOpen,
  patchTest,
  staffFor,
}: {
  label: string;
  items: BookableService[];
  onOpen: (s: BookableService) => void;
  patchTest: (s: BookableService) => boolean;
  staffFor: (s: BookableService) => StaffMemberRow[];
}) {
  return (
    <>
      <tr className="st-group">
        <td colSpan={6}>
          {label} <span className="st-muted">· {items.length}</span>
        </td>
      </tr>
      {items.map((s) => {
        const mode = s.booking_mode ?? "both";
        const people = staffFor(s);
        return (
          <tr
            key={s.id}
            className="st-clickable"
            tabIndex={0}
            onClick={() => onOpen(s)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(s))}
          >
            <td>
              {s.name} {s.active === false && <span className="st-chip">Hidden</span>}
            </td>
            <td className="st-num">{s.duration_minutes ? formatDuration(s.duration_minutes) : <span className="st-muted">—</span>}</td>
            <td className="st-num">
              {s.price_is_from ? "from " : ""}
              {formatMoney(s.price_amount, s.price_currency)}
            </td>
            <td>{patchTest(s) ? <span className="st-chip st-chip--warn">Required</span> : <span className="st-muted">—</span>}</td>
            <td>
              <span className={`st-chip ${mode === "walk_in_only" ? "st-chip--warn" : mode === "bookable_only" ? "st-chip--ok" : "st-chip--acc"}`}>
                {BOOKING_MODE_LABEL[mode]}
              </span>
            </td>
            <td>
              {people.length === 0 ? (
                <span className="st-muted">Nobody</span>
              ) : (
                <span style={{ display: "inline-flex", gap: 4 }} title={people.map((m) => m.display_name).join(", ")}>
                  {people.map((m) => (
                    <span key={m.id} className="st-dot" style={{ ["--dot" as string]: m.colour ?? undefined }} />
                  ))}
                </span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
