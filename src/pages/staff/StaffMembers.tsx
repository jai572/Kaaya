import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  staffListStaffMembers,
  staffCreateStaffMember,
  staffUpdateStaffMember,
  staffListBookingServices,
  staffListServiceStaffLinks,
  staffSetStaffServices,
  staffGetRota,
  staffListLocations,
  type BookableService,
  type StaffMemberRow,
  type RotaHoursRow,
  type LocationRow,
} from "../../lib/api";
import { STAFF_COLOURS, categoryLabel, nextFreeColour } from "../../lib/staffFormat";
import { Drawer, PageHead, Switch, errorMessage } from "../../components/staff/ui";

type Form = {
  id: string | null;
  name: string;
  colour: string;
  active: boolean;
  serviceIds: string[];
};

export default function StaffMembers() {
  const [staff, setStaff] = useState<StaffMemberRow[] | null>(null);
  const [services, setServices] = useState<BookableService[]>([]);
  const [links, setLinks] = useState<{ service_id: string; staff_member_id: string }[]>([]);
  const [rota, setRota] = useState<RotaHoursRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [st, svc, ln, rt, lc] = await Promise.all([
        staffListStaffMembers(),
        staffListBookingServices(),
        staffListServiceStaffLinks(),
        staffGetRota(),
        staffListLocations(),
      ]);
      setStaff(st.staffMembers);
      setServices(svc.services.filter((s) => s.active !== false));
      setLinks(ln.links);
      setRota(rt.hours);
      setLocations(lc.locations);
    } catch (e) {
      setError(errorMessage(e, "Could not load staff"));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const serviceGroups = useMemo(() => {
    const cats = [...new Set(services.map((s) => s.category_slug))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
    return cats.map((c) => ({
      slug: c,
      items: services.filter((s) => s.category_slug === c).sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),
    }));
  }, [services]);

  const locationName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);

  function worksAt(staffId: string): string {
    const ids = [...new Set(rota.filter((r) => r.staff_member_id === staffId && r.location_id).map((r) => r.location_id as string))];
    if (ids.length === 0) return "Not on the rota";
    return ids.map((id) => locationName.get(id) ?? "Unknown").join(", ");
  }

  function openNew() {
    setForm({ id: null, name: "", colour: nextFreeColour((staff ?? []).map((m) => m.colour)), active: true, serviceIds: [] });
    setFormError(null);
  }

  function openEdit(m: StaffMemberRow) {
    setForm({
      id: m.id,
      name: m.display_name,
      colour: m.colour ?? nextFreeColour((staff ?? []).filter((x) => x.id !== m.id).map((x) => x.colour)),
      active: m.active,
      serviceIds: links.filter((l) => l.staff_member_id === m.id).map((l) => l.service_id),
    });
    setFormError(null);
  }

  function toggleService(id: string) {
    if (!form) return;
    setForm({ ...form, serviceIds: form.serviceIds.includes(id) ? form.serviceIds.filter((x) => x !== id) : [...form.serviceIds, id] });
  }

  function toggleGroup(ids: string[], allOn: boolean) {
    if (!form) return;
    const set = new Set(form.serviceIds);
    ids.forEach((id) => (allOn ? set.delete(id) : set.add(id)));
    setForm({ ...form, serviceIds: [...set] });
  }

  async function save() {
    if (!form) return;
    if (!form.name.trim()) return setFormError("Enter a name.");
    setSaving(true);
    setFormError(null);
    try {
      let id = form.id;
      if (id) {
        await staffUpdateStaffMember(id, { display_name: form.name.trim(), colour: form.colour, active: form.active });
      } else {
        id = (await staffCreateStaffMember({ display_name: form.name.trim(), colour: form.colour })).id;
      }
      await staffSetStaffServices(id, form.serviceIds);
      setForm(null);
      await load();
    } catch (e) {
      setFormError(errorMessage(e, "Could not save staff member"));
    } finally {
      setSaving(false);
    }
  }

  const usedColours = new Map((staff ?? []).filter((m) => m.id !== form?.id && m.colour).map((m) => [m.colour!.toLowerCase(), m.display_name]));

  return (
    <div className="st-page">
      <PageHead
        title="Staff"
        subtitle="Who works here, their calendar colour and which treatments they do. Hours and locations are on the Rota."
        actions={
          <button type="button" className="st-btn" onClick={openNew}>
            + Add staff member
          </button>
        }
      />

      {error && <div className="st-error" role="alert">{error}</div>}

      <div className="st-card st-table-wrap">
        {staff === null ? (
          <div className="st-empty">Loading…</div>
        ) : staff.length === 0 ? (
          <div className="st-empty">No staff yet. Add the first one.</div>
        ) : (
          <table className="st-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Treatments</th>
                <th>Works at</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((m) => {
                const count = links.filter((l) => l.staff_member_id === m.id).length;
                return (
                  <tr
                    key={m.id}
                    className="st-clickable"
                    tabIndex={0}
                    onClick={() => openEdit(m)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openEdit(m))}
                  >
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                        <span className="st-dot" style={{ ["--dot" as string]: m.colour ?? undefined, width: 16, height: 16 }} />
                        <b>{m.display_name}</b>
                      </span>
                    </td>
                    <td className="st-num">{count === 0 ? <span className="st-chip st-chip--warn">None yet</span> : `${count} of ${services.length}`}</td>
                    <td>{worksAt(m.id)}</td>
                    <td>{m.active ? <span className="st-chip st-chip--ok">Active</span> : <span className="st-chip">Inactive</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <Drawer
          title={form.id ? `Edit ${form.name || "staff member"}` : "Add staff member"}
          onClose={() => setForm(null)}
          footer={
            <>
              <button type="button" className="st-btn st-btn--ghost" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button type="button" className="st-btn" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save staff member"}
              </button>
            </>
          }
        >
          {formError && <div className="st-error" role="alert">{formError}</div>}

          <div className="st-field">
            <label htmlFor="staff-name">Name</label>
            <input id="staff-name" className="st-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="st-field">
            <span className="st-label">Appointment colour</span>
            <div className="st-swatches" role="group" aria-label="Appointment colour">
              {STAFF_COLOURS.map((c) => {
                const takenBy = usedColours.get(c.toLowerCase());
                return (
                  <button
                    key={c}
                    type="button"
                    className="st-swatch"
                    style={{ ["--sw" as string]: c }}
                    aria-pressed={form.colour.toLowerCase() === c.toLowerCase()}
                    aria-label={takenBy ? `${c} (used by ${takenBy})` : c}
                    title={takenBy ? `Used by ${takenBy}` : undefined}
                    onClick={() => setForm({ ...form, colour: c })}
                  />
                );
              })}
            </div>
            <span className="st-hint">
              Their appointment slots on the calendar use this colour.
              {usedColours.has(form.colour.toLowerCase()) && ` Also used by ${usedColours.get(form.colour.toLowerCase())}.`}
            </span>
          </div>

          <div className="st-field">
            <span className="st-label">Treatments they do ({form.serviceIds.length})</span>
            {serviceGroups.map((g) => {
              const ids = g.items.map((s) => s.id);
              const allOn = ids.every((id) => form.serviceIds.includes(id));
              return (
                <div key={g.slug} className="st-group-block">
                  <div className="st-group-block-head">
                    <span>{categoryLabel(g.slug)}</span>
                    <button type="button" className="st-link" onClick={() => toggleGroup(ids, allOn)}>
                      {allOn ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <div className="st-group-block-body">
                    {g.items.map((s) => (
                      <label key={s.id} className="st-check">
                        <input type="checkbox" checked={form.serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {form.id && (
            <Switch id="staff-active" checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label={form.active ? "Active" : "Inactive (hidden from booking)"} />
          )}

          <span className="st-hint">
            Working days, hours and location are set on the <Link to="/staff/rota">Rota</Link>.
          </span>
        </Drawer>
      )}
    </div>
  );
}
