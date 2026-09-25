import { useMemo, useState } from "react";
import {
  staffCheckout,
  type BookableService,
  type CalendarAppointment,
  type CalendarData,
  type ClientSummary,
  type PaymentMethod,
} from "../../../lib/api";
import { clockTime } from "../../../lib/calendarLayout";
import { categoryLabel, parsePriceToPence, penceToInput } from "../../../lib/staffFormat";
import { Drawer, Segmented, errorMessage } from "../../../components/staff/ui";
import { ClientPicker } from "./NewAppointmentDrawer";
import { apptTitle, money } from "./shared";

interface Line {
  key: number;
  service_id: string | null;
  appointment_id: string | null;
  staff_member_id: string | null;
  description: string;
  price: string; // pounds, as typed
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "voucher", label: "Voucher" },
  { value: "other", label: "Other" },
];

let lineKey = 0;

export default function CheckoutDrawer({
  data,
  services,
  appointment,
  onClose,
  onDone,
}: {
  data: CalendarData;
  services: BookableService[];
  appointment: CalendarAppointment | null; // null = walk-in sale
  onClose: () => void;
  onDone: () => void;
}) {
  const staffName = useMemo(() => new Map(data.staff.map((s) => [s.id, s.display_name])), [data.staff]);
  const activeStaff = data.staff.filter((s) => s.active && (data.can_view_all || s.id === data.own_staff_member_id));

  // A visit is checked out as one: every confirmed, unpaid part of it.
  const parts = useMemo(() => {
    if (!appointment) return [];
    if (!appointment.visit_id) return [appointment];
    return data.appointments
      .filter((a) => a.visit_id === appointment.visit_id && a.status === "confirmed" && !a.sale_id)
      .sort((x, y) => Date.parse(x.scheduled_at) - Date.parse(y.scheduled_at));
  }, [appointment, data.appointments]);
  const pendingParts = appointment?.visit_id
    ? data.appointments.filter((a) => a.visit_id === appointment.visit_id && a.status === "pending_approval")
    : [];

  const [client, setClient] = useState<ClientSummary | null>(null);
  const [lines, setLines] = useState<Line[]>(() =>
    parts.flatMap((p) => {
      const items = p.appointment_items.length
        ? p.appointment_items
        : [{ id: p.id, service_id: p.service_id, service_name: p.service_name, duration_minutes: p.duration_minutes, price_amount: p.price_amount, staff_member_id: p.staff_member_id }];
      return items.map((i) => ({
        key: ++lineKey,
        service_id: i.service_id,
        appointment_id: p.id,
        staff_member_id: i.staff_member_id ?? p.staff_member_id,
        description: i.service_name,
        price: penceToInput(i.price_amount),
      }));
    })
  );
  const [addStaff, setAddStaff] = useState<string>(parts[0]?.staff_member_id ?? data.own_staff_member_id ?? activeStaff[0]?.id ?? "");
  const [filter, setFilter] = useState("");
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prices = lines.map((l) => parsePriceToPence(l.price || "0"));
  const discountPence = discount.trim() ? parsePriceToPence(discount) : 0;
  const subtotal = prices.reduce<number>((n, p) => n + (p ?? 0), 0);
  const invalid = prices.some((p) => p === null) || discountPence === null || (discountPence ?? 0) > subtotal;
  const total = subtotal - (discountPence ?? 0);

  const f = filter.trim().toLowerCase();
  const matches = f
    ? services.filter((s) => s.active !== false && (s.name.toLowerCase().includes(f) || s.category_slug.includes(f))).slice(0, 12)
    : [];

  function addService(s: BookableService) {
    const part = parts.find((p) => p.staff_member_id === addStaff) ?? null;
    setLines([
      ...lines,
      {
        key: ++lineKey,
        service_id: s.id,
        appointment_id: part?.id ?? null,
        staff_member_id: addStaff || null,
        description: s.name,
        price: penceToInput(s.price_amount),
      },
    ]);
    setFilter("");
  }

  async function takePayment() {
    setBusy(true);
    setError(null);
    try {
      await staffCheckout({
        location_id: data.location.id,
        client_id: appointment ? appointment.client_id : client?.id ?? null,
        appointment_ids: parts.map((p) => p.id),
        items: lines.map((l, i) => ({
          service_id: l.service_id,
          appointment_id: l.appointment_id,
          staff_member_id: l.staff_member_id,
          description: l.description,
          quantity: 1,
          unit_price_amount: prices[i] ?? 0,
        })),
        discount_amount: discountPence ?? 0,
        payment_method: method,
        payment_note: note.trim() || null,
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e, "Could not take payment"));
    } finally {
      setBusy(false);
    }
  }

  const methodLabel = METHODS.find((m) => m.value === method)!.label;
  const ready = lines.length > 0 && !invalid && (method !== "voucher" || note.trim().length > 0) && (!appointment || parts.length > 0);

  return (
    <Drawer
      title={appointment ? `Checkout · ${apptTitle(appointment)}` : "Walk-in sale"}
      onClose={onClose}
      footer={
        <>
          <span className="st-foot-total">Total {money(Math.max(0, total))}</span>
          <button type="button" className="st-btn st-btn--ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="button" className="st-btn" disabled={!ready || busy} onClick={takePayment}>
            {busy ? "Saving…" : `Paid ${money(Math.max(0, total))} · ${methodLabel}`}
          </button>
        </>
      }
    >
      {!appointment && <ClientPicker client={client} onChange={setClient} locked={false} />}
      {!appointment && !client && <span className="st-hint">No client needed for a quick walk-in — leave it blank.</span>}

      {appointment && parts.length > 1 && (
        <p className="st-note">
          Whole visit: {parts.map((p) => `${clockTime(p.scheduled_at)} with ${staffName.get(p.staff_member_id) ?? "?"}`).join(", ")}.
        </p>
      )}
      {pendingParts.length > 0 && (
        <p className="st-note st-note--warn">Part of this visit is still waiting for approval — approve it first to include it.</p>
      )}
      {appointment && parts.length === 0 && <p className="st-note st-note--warn">Nothing left to pay for on this visit.</p>}

      <div className="st-group-block">
        <div className="st-group-block-head">
          <span>Items</span>
          <span>{money(subtotal)}</span>
        </div>
        <ul className="st-checkout-lines">
          {lines.map((l, i) => (
            <li key={l.key}>
              <span className="st-checkout-desc">
                {l.description}
                <span className="st-muted">{l.staff_member_id ? staffName.get(l.staff_member_id) : ""}</span>
              </span>
              <label className="st-price">
                <span aria-hidden="true">£</span>
                <input
                  className="st-input"
                  inputMode="decimal"
                  aria-label={`Price for ${l.description}`}
                  value={l.price}
                  aria-invalid={prices[i] === null}
                  onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, price: e.target.value } : x)))}
                />
              </label>
              <button
                type="button"
                className="st-icon-btn"
                aria-label={`Remove ${l.description}`}
                onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
              >
                ×
              </button>
            </li>
          ))}
          {lines.length === 0 && <li className="st-muted">Add what the client had below.</li>}
        </ul>
      </div>

      <div className="st-field">
        <label htmlFor="co-add">Add a treatment or product</label>
        <div className="st-checkout-add">
          <select className="st-select" aria-label="Done by" value={addStaff} onChange={(e) => setAddStaff(e.target.value)}>
            {activeStaff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
          <input id="co-add" className="st-input" placeholder="Search e.g. threading, lip, oil" value={filter} onChange={(e) => setFilter(e.target.value)} autoComplete="off" />
        </div>
        {matches.length > 0 && (
          <div className="st-results">
            {matches.map((s) => (
              <button key={s.id} type="button" className="st-row-btn" onClick={() => addService(s)}>
                <b>{s.name}</b>
                <span className="st-muted">
                  {categoryLabel(s.category_slug)} · {money(s.price_amount)}
                  {s.booking_mode === "walk_in_only" ? " · walk-in" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="st-grid-2">
        <div className="st-field">
          <label htmlFor="co-discount">Discount (£)</label>
          <input id="co-discount" className="st-input" inputMode="decimal" placeholder="0.00" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
      </div>

      <div className="st-field">
        <span className="st-label">Paid by</span>
        <Segmented label="Paid by" value={method} options={METHODS} onChange={setMethod} />
      </div>
      {(method === "voucher" || method === "other") && (
        <div className="st-field">
          <label htmlFor="co-note">{method === "voucher" ? "Voucher number" : "Note (e.g. bank transfer)"}</label>
          <input id="co-note" className="st-input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      {method === "card" && <span className="st-hint">Take the card payment on the card machine, then press Paid.</span>}
      {invalid && <p className="st-error">Check the prices and discount — use amounts like 12 or 12.50, and the discount can't exceed the total.</p>}
      {error && <p className="st-error">{error}</p>}
    </Drawer>
  );
}
