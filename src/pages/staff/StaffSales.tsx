import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  staffGetDailySales,
  staffListLocations,
  staffVoidSale,
  type DailySale,
  type DailySalesData,
  type LocationRow,
  type PaymentMethod,
} from "../../lib/api";
import { addDays, clockTime, londonToday } from "../../lib/calendarLayout";
import { Drawer, PageHead, errorMessage } from "../../components/staff/ui";
import { money, staffColour } from "./calendar/shared";

const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", card: "Card", voucher: "Voucher", other: "Other" };
const LOC_KEY = "kaaya.staff.sales.location";

function clientName(s: DailySale): string {
  return s.clients ? `${s.clients.first_name} ${s.clients.last_name}`.trim() : "Walk-in";
}

export default function StaffSales() {
  const [params, setParams] = useSearchParams();
  const today = londonToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? (params.get("date") as string) : today;
  const setDate = (d: string) => setParams(d === today ? {} : { date: d }, { replace: true });

  const [locations, setLocations] = useState<LocationRow[] | null>(null);
  const [locationId, setLocationId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(LOC_KEY);
    } catch {
      return null;
    }
  });
  const [data, setData] = useState<DailySalesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    staffListLocations()
      .then(({ locations }) => setLocations(locations.filter((l) => l.active)))
      .catch((e) => setError(errorMessage(e, "Could not load locations")));
  }, []);

  const loc = useMemo(() => {
    if (!locations?.length) return null;
    return locations.find((l) => l.id === locationId) ?? locations.find((l) => l.hours.length > 0) ?? locations[0];
  }, [locations, locationId]);

  const load = useCallback(() => {
    if (!loc) return;
    setLoading(true);
    staffGetDailySales(loc.id, date)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => {
        setData(null);
        setError(errorMessage(e, "Could not load sales"));
      })
      .finally(() => setLoading(false));
  }, [loc, date]);
  useEffect(load, [load]);

  const staffById = useMemo(() => new Map((data?.staff ?? []).map((s) => [s.id, s])), [data]);
  const profileName = useMemo(() => new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name])), [data]);
  const open = data?.sales.find((s) => s.id === openId) ?? null;
  const s = data?.summary;

  return (
    <div className="st-page">
      <PageHead title="Daily sales" subtitle="What was taken, how it was paid and who did the work." />

      <div className="st-cal-toolbar">
        <div className="st-cal-toolbar-group">
          {locations && locations.length > 1 && (
            <select
              className="st-select st-cal-loc"
              aria-label="Location"
              value={loc?.id ?? ""}
              onChange={(e) => {
                setLocationId(e.target.value);
                try {
                  window.localStorage.setItem(LOC_KEY, e.target.value);
                } catch {
                  // remembered per device only
                }
              }}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <div className="st-cal-nav">
            <button type="button" className="st-btn st-btn--ghost st-btn--sm" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
              ‹
            </button>
            <button type="button" className="st-btn st-btn--ghost st-btn--sm" onClick={() => setDate(today)} disabled={date === today}>
              Today
            </button>
            <button type="button" className="st-btn st-btn--ghost st-btn--sm" aria-label="Next day" onClick={() => setDate(addDays(date, 1))} disabled={date >= today}>
              ›
            </button>
          </div>
          <label className="st-cal-date">
            <span>
              {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
            </span>
            <input type="date" aria-label="Go to date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          {loading && <span className="st-hint">Loading…</span>}
        </div>
      </div>

      {error && <p className="st-error">{error}</p>}

      {s && (
        <>
          <div className="st-tiles">
            <div className="st-tile st-tile--main">
              <span>Taken</span>
              <b>{money(s.total)}</b>
              <small>
                {s.count} sale{s.count === 1 ? "" : "s"}
              </small>
            </div>
            <div className="st-tile st-tile--card">
              <span>Card</span>
              <b>{money(s.by_method.card)}</b>
              <small>Check against the card machine's end-of-day total</small>
            </div>
            <div className="st-tile">
              <span>Cash</span>
              <b>{money(s.by_method.cash)}</b>
              <small>Should be in the till</small>
            </div>
            <div className="st-tile">
              <span>Voucher</span>
              <b>{money(s.by_method.voucher)}</b>
            </div>
            <div className="st-tile">
              <span>Other</span>
              <b>{money(s.by_method.other)}</b>
            </div>
          </div>

          <div className="st-flags">
            <span className={s.discounts ? "st-chip st-chip--warn" : "st-chip"}>Discounts {money(s.discounts)}</span>
            <span className={s.adjusted_count ? "st-chip st-chip--warn" : "st-chip"}>
              {s.adjusted_count} sale{s.adjusted_count === 1 ? "" : "s"} with changed prices or discount
            </span>
            <span className={s.voided.count ? "st-chip st-chip--bad" : "st-chip"}>
              {s.voided.count} voided ({money(s.voided.amount)})
            </span>
          </div>

          <div className="st-split">
            <div className="st-card">
              <div className="st-card-head">
                <h2>By staff</h2>
              </div>
              {s.by_staff.length === 0 ? (
                <p className="st-empty">No sales yet.</p>
              ) : (
                <table className="st-table">
                  <tbody>
                    {s.by_staff.map((r) => {
                      const m = r.staff_member_id ? staffById.get(r.staff_member_id) : null;
                      return (
                        <tr key={r.staff_member_id ?? "none"}>
                          <td>
                            <span className="st-dot" style={{ "--dot": staffColour(m?.colour) } as CSSProperties} /> {m?.display_name ?? "Not assigned"}
                          </td>
                          <td className="st-num st-muted">{r.items} items</td>
                          <td className="st-num">{money(r.amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <p className="st-hint st-card-foot">Before discounts — a discount comes off the whole bill.</p>
            </div>

            <div className="st-card">
              <div className="st-card-head">
                <h2>Sales</h2>
              </div>
              {data!.sales.length === 0 ? (
                <p className="st-empty">Nothing taken on this day.</p>
              ) : (
                <div className="st-table-wrap">
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Client</th>
                        <th>Items</th>
                        <th>Paid by</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.sales.map((sale) => (
                        <tr key={sale.id} className={`st-clickable${sale.voided_at ? " st-voided" : ""}`} onClick={() => setOpenId(sale.id)}>
                          <td className="st-num">{clockTime(sale.created_at)}</td>
                          <td>{clientName(sale)}</td>
                          <td>
                            {sale.sale_items.map((i) => i.description).join(", ")}
                            {sale.price_adjusted && !sale.voided_at && <span className="st-chip st-chip--warn st-chip--inline">Changed</span>}
                            {sale.voided_at && <span className="st-chip st-chip--bad st-chip--inline">Voided</span>}
                          </td>
                          <td>
                            {METHOD_LABEL[sale.payment_method]}
                            {sale.payment_note ? <span className="st-muted"> · {sale.payment_note}</span> : null}
                          </td>
                          <td className="st-num">{money(sale.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {open && data && (
        <SaleDrawer
          sale={open}
          canVoid={data.can_void}
          staffName={(id) => (id ? staffById.get(id)?.display_name ?? "?" : "")}
          profileName={(id) => (id ? profileName.get(id) ?? "?" : "?")}
          onClose={() => setOpenId(null)}
          onVoided={() => {
            setOpenId(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SaleDrawer({
  sale,
  canVoid,
  staffName,
  profileName,
  onClose,
  onVoided,
}: {
  sale: DailySale;
  canVoid: boolean;
  staffName: (id: string | null) => string;
  profileName: (id: string | null) => string;
  onClose: () => void;
  onVoided: () => void;
}) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doVoid() {
    setBusy(true);
    setError(null);
    try {
      await staffVoidSale(sale.id, reason);
      onVoided();
    } catch (e) {
      setError(errorMessage(e, "Could not void"));
      setBusy(false);
    }
  }

  const footer =
    !sale.voided_at && canVoid ? (
      voiding ? (
        <>
          <button type="button" className="st-btn st-btn--ghost" onClick={() => setVoiding(false)} disabled={busy}>
            Keep sale
          </button>
          <button type="button" className="st-btn st-btn--danger" onClick={doVoid} disabled={busy || reason.trim().length < 3}>
            {busy ? "Voiding…" : `Void ${money(sale.total_amount)}`}
          </button>
        </>
      ) : (
        <button type="button" className="st-btn st-btn--danger" onClick={() => setVoiding(true)}>
          Void sale…
        </button>
      )
    ) : undefined;

  return (
    <Drawer title={`${clientName(sale)} · ${money(sale.total_amount)}`} onClose={onClose} footer={footer}>
      {sale.voided_at && (
        <p className="st-note st-note--warn">
          Voided at {clockTime(sale.voided_at)} by {profileName(sale.voided_by)}: “{sale.void_reason}”. Not counted in takings.
        </p>
      )}
      <dl className="st-panel-dl">
        <dt>Time</dt>
        <dd>{clockTime(sale.created_at)}</dd>
        <dt>Paid by</dt>
        <dd>
          {METHOD_LABEL[sale.payment_method]}
          {sale.payment_note ? ` · ${sale.payment_note}` : ""}
        </dd>
        <dt>Taken by</dt>
        <dd>{profileName(sale.completed_by)}</dd>
        {sale.client_id && (
          <>
            <dt>Client</dt>
            <dd>
              <Link to={`/staff/clients/${sale.client_id}`}>{clientName(sale)} →</Link>
            </dd>
          </>
        )}
      </dl>

      <div className="st-group-block">
        <div className="st-group-block-head">
          <span>Items</span>
          <span>{money(sale.subtotal_amount)}</span>
        </div>
        <ul className="st-panel-items">
          {sale.sale_items.map((i) => {
            const changed = i.list_price_amount !== null && i.list_price_amount !== i.unit_price_amount;
            return (
              <li key={i.id}>
                <span>
                  {i.description}
                  <span className="st-muted"> · {staffName(i.staff_member_id)}</span>
                </span>
                <span>
                  {changed && <s className="st-muted">{money(i.list_price_amount!)}</s>} {money(i.line_total_amount)}
                </span>
              </li>
            );
          })}
          {sale.discount_amount > 0 && (
            <li>
              <span>Discount</span>
              <span>−{money(sale.discount_amount)}</span>
            </li>
          )}
          <li>
            <b>Total</b>
            <b>{money(sale.total_amount)}</b>
          </li>
        </ul>
      </div>

      {voiding && (
        <div className="st-field">
          <label htmlFor="void-reason">Why is this being voided?</label>
          <input
            id="void-reason"
            className="st-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. rung up the wrong treatment"
          />
          <span className="st-hint">The sale stays on record as voided. Any appointments go back to “confirmed” so the visit can be checked out again.</span>
        </div>
      )}
      {error && <p className="st-error">{error}</p>}
    </Drawer>
  );
}
