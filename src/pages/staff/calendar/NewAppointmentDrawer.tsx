import { useEffect, useMemo, useState } from "react";
import {
  staffCreateCalendarAppointments,
  staffCreateClient,
  staffSearchClients,
  type BookableService,
  type CalendarData,
  type ClientSummary,
} from "../../../lib/api";
import { durationLabel, londonWallToIso, minutesToTime, timeToMinutes } from "../../../lib/calendarLayout";
import { categoryLabel } from "../../../lib/staffFormat";
import { Drawer, errorMessage } from "../../../components/staff/ui";
import { money } from "./shared";

export interface NewAppointmentPrefill {
  date: string;
  time: string;
  staffId: string | null;
  client?: ClientSummary | null;
  linkAppointmentId?: string | null;
}

interface Part {
  key: number;
  staffId: string;
  date: string;
  time: string;
  serviceIds: string[];
}

let partKey = 0;

export default function NewAppointmentDrawer({
  data,
  services,
  links,
  prefill,
  onClose,
  onBooked,
}: {
  data: CalendarData;
  services: BookableService[];
  links: { service_id: string; staff_member_id: string }[];
  prefill: NewAppointmentPrefill;
  onClose: () => void;
  onBooked: () => void;
}) {
  const activeStaff = data.staff.filter((s) => s.active && (data.can_view_all || s.id === data.own_staff_member_id));
  const [client, setClient] = useState<ClientSummary | null>(prefill.client ?? null);
  const [parts, setParts] = useState<Part[]>([
    { key: ++partKey, staffId: prefill.staffId ?? activeStaff[0]?.id ?? "", date: prefill.date, time: prefill.time, serviceIds: [] },
  ]);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const partMinutes = (p: Part) => p.serviceIds.reduce((n, id) => n + (serviceById.get(id)?.duration_minutes ?? 0), 0);
  const partEnd = (p: Part) => minutesToTime(Math.min(24 * 60 - 5, timeToMinutes(p.time || "00:00") + partMinutes(p)));

  function update(key: number, patch: Partial<Part>) {
    setWarnings(null);
    setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function addPart() {
    setWarnings(null);
    const last = parts[parts.length - 1];
    const other = activeStaff.find((s) => s.id !== last.staffId) ?? activeStaff[0];
    setParts([...parts, { key: ++partKey, staffId: other?.id ?? "", date: last.date, time: partEnd(last), serviceIds: [] }]);
  }

  const total = parts.reduce((n, p) => n + p.serviceIds.reduce((m, id) => m + (serviceById.get(id)?.price_amount ?? 0), 0), 0);
  const ready = !!client && parts.every((p) => p.staffId && p.date && p.time && p.serviceIds.length > 0);

  async function book(confirm: boolean) {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const res = await staffCreateCalendarAppointments({
        client_id: client.id,
        location_id: data.location.id,
        link_appointment_id: prefill.linkAppointmentId ?? null,
        confirm_warnings: confirm,
        parts: parts.map((p) => ({ staff_member_id: p.staffId, start_at: londonWallToIso(p.date, p.time), service_ids: p.serviceIds })),
      });
      if (res.needs_confirmation) {
        setWarnings(res.warnings);
        return;
      }
      onBooked();
    } catch (e) {
      setError(errorMessage(e, "Could not book"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={prefill.linkAppointmentId ? "Add to this visit" : "New appointment"}
      onClose={onClose}
      footer={
        <>
          <span className="st-foot-total">{total > 0 && `Total ${money(total)}`}</span>
          <button type="button" className="st-btn st-btn--ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="button" className="st-btn" disabled={!ready || busy} onClick={() => book(!!warnings)}>
            {busy ? "Booking…" : warnings ? "Book anyway" : "Book"}
          </button>
        </>
      }
    >
      <ClientPicker client={client} onChange={setClient} locked={!!prefill.linkAppointmentId} />

      {parts.map((p, i) => (
        <PartEditor
          key={p.key}
          index={i}
          part={p}
          staff={activeStaff}
          services={services}
          links={links}
          minutes={partMinutes(p)}
          end={partEnd(p)}
          onChange={(patch) => update(p.key, patch)}
          onRemove={parts.length > 1 ? () => setParts(parts.filter((x) => x.key !== p.key)) : undefined}
        />
      ))}

      {activeStaff.length > 1 && (
        <button type="button" className="st-btn st-btn--ghost st-btn--sm st-self-start" onClick={addPart}>
          + Then a treatment with someone else
        </button>
      )}

      {warnings && (
        <div className="st-note st-note--warn" role="alert">
          <b>Please check before booking:</b>
          <ul className="st-warn-list">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          Staff can still book it — press “Book anyway”.
        </div>
      )}
      {error && <p className="st-error">{error}</p>}
    </Drawer>
  );
}

export function ClientPicker({ client, onChange, locked }: { client: ClientSummary | null; onChange: (c: ClientSummary | null) => void; locked: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ClientSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(() => {
      staffSearchClients(q.trim())
        .then((r) => setResults(r.clients))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, client]);

  async function add() {
    setError(null);
    try {
      const res = await staffCreateClient({ ...form, email: form.email || null });
      onChange(res.client);
      setAdding(false);
    } catch (e) {
      setError(errorMessage(e, "Could not add client"));
    }
  }

  if (client) {
    return (
      <div className="st-picked-client">
        <div>
          <b>
            {client.first_name} {client.last_name}
          </b>
          <span className="st-muted">{client.phone}</span>
        </div>
        {!locked && (
          <button type="button" className="st-link" onClick={() => onChange(null)}>
            Change
          </button>
        )}
      </div>
    );
  }

  if (adding) {
    return (
      <div className="st-group-block">
        <div className="st-group-block-head">New client</div>
        <div className="st-card-body">
          <div className="st-grid-2">
            <div className="st-field">
              <label htmlFor="nc-first">First name</label>
              <input id="nc-first" className="st-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="st-field">
              <label htmlFor="nc-last">Last name</label>
              <input id="nc-last" className="st-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div className="st-grid-2">
            <div className="st-field">
              <label htmlFor="nc-phone">Phone</label>
              <input id="nc-phone" className="st-input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="st-field">
              <label htmlFor="nc-email">Email (optional)</label>
              <input id="nc-email" className="st-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          {error && <p className="st-error">{error}</p>}
          <div className="st-btn-row">
            <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={() => setAdding(false)}>
              Back to search
            </button>
            <button type="button" className="st-btn st-btn--sm" disabled={!form.first_name.trim() || form.phone.trim().length < 5} onClick={add}>
              Add client
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="st-field">
      <label htmlFor="nc-search">Client</label>
      <input
        id="nc-search"
        className="st-input"
        placeholder="Search name, phone or email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
      />
      {searching && <span className="st-hint">Searching…</span>}
      {results.length > 0 && (
        <div className="st-results">
          {results.map((c) => (
            <button key={c.id} type="button" className="st-row-btn" onClick={() => onChange(c)}>
              <b>
                {c.first_name} {c.last_name}
              </b>
              <span className="st-muted">
                {c.phone}
                {c.email ? ` · ${c.email}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
      {!searching && q.trim().length >= 2 && results.length === 0 && <span className="st-hint">No match.</span>}
      <button
        type="button"
        className="st-btn st-btn--ghost st-btn--sm st-self-start"
        onClick={() => {
          const [first, ...rest] = q.trim().split(" ");
          setForm({ first_name: /\d/.test(first ?? "") ? "" : first ?? "", last_name: rest.join(" "), phone: /\d/.test(q) ? q.trim() : "", email: "" });
          setAdding(true);
        }}
      >
        + New client
      </button>
    </div>
  );
}

function PartEditor({
  index,
  part,
  staff,
  services,
  links,
  minutes,
  end,
  onChange,
  onRemove,
}: {
  index: number;
  part: Part;
  staff: CalendarData["staff"];
  services: BookableService[];
  links: { service_id: string; staff_member_id: string }[];
  minutes: number;
  end: string;
  onChange: (patch: Partial<Part>) => void;
  onRemove?: () => void;
}) {
  const [filter, setFilter] = useState("");
  const canDo = useMemo(
    () => new Set(links.filter((l) => l.staff_member_id === part.staffId).map((l) => l.service_id)),
    [links, part.staffId]
  );
  const available = services.filter((s) => s.active !== false && s.duration_minutes && canDo.has(s.id));
  const f = filter.trim().toLowerCase();
  const shown = available.filter((s) => !f || s.name.toLowerCase().includes(f) || s.category_slug.includes(f));
  const groups = new Map<string, BookableService[]>();
  for (const s of shown) groups.set(s.category_slug, [...(groups.get(s.category_slug) ?? []), s]);

  function toggle(id: string) {
    onChange({ serviceIds: part.serviceIds.includes(id) ? part.serviceIds.filter((x) => x !== id) : [...part.serviceIds, id] });
  }

  return (
    <div className="st-group-block">
      <div className="st-group-block-head">
        <span>{index === 0 ? "Treatment" : `Then (${index + 1})`}</span>
        {onRemove && (
          <button type="button" className="st-link" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <div className="st-card-body">
        <div className="st-grid-3">
          <div className="st-field">
            <label htmlFor={`p${part.key}-staff`}>With</label>
            <select
              id={`p${part.key}-staff`}
              className="st-select"
              value={part.staffId}
              onChange={(e) => onChange({ staffId: e.target.value, serviceIds: [] })}
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="st-field">
            <label htmlFor={`p${part.key}-date`}>Date</label>
            <input id={`p${part.key}-date`} className="st-input" type="date" value={part.date} onChange={(e) => onChange({ date: e.target.value })} />
          </div>
          <div className="st-field">
            <label htmlFor={`p${part.key}-time`}>Start</label>
            <input
              id={`p${part.key}-time`}
              className="st-input"
              type="time"
              step={300}
              value={part.time}
              onChange={(e) => onChange({ time: e.target.value })}
            />
          </div>
        </div>

        {part.serviceIds.length > 0 && (
          <div className="st-pick-list">
            {part.serviceIds.map((id) => (
              <button key={id} type="button" className="st-pick" aria-pressed="true" onClick={() => toggle(id)} title="Remove">
                {services.find((s) => s.id === id)?.name ?? "Treatment"} ×
              </button>
            ))}
            <span className="st-hint">
              {part.time}–{end} · {durationLabel(minutes)}
            </span>
          </div>
        )}

        {available.length === 0 ? (
          <p className="st-note st-note--warn">No treatments are linked to this person yet. Set them in Setup → Staff.</p>
        ) : (
          <>
            <input
              className="st-input"
              placeholder="Find a treatment"
              aria-label="Find a treatment"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="st-svc-list">
              {[...groups.entries()].map(([slug, list]) => (
                <div key={slug}>
                  <div className="st-svc-group">{categoryLabel(slug)}</div>
                  {list.map((s) => (
                    <label key={s.id} className="st-svc">
                      <input type="checkbox" checked={part.serviceIds.includes(s.id)} onChange={() => toggle(s.id)} />
                      <span>{s.name}</span>
                      <span className="st-muted">
                        {durationLabel(s.duration_minutes ?? 0)} · {money(s.price_amount)}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
              {shown.length === 0 && <p className="st-hint">No treatment matches “{filter}”.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
