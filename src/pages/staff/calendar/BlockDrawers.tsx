import { useState } from "react";
import { staffCreateTimeBlock, staffDeleteTimeBlock, type BlockReason, type CalendarBlock, type CalendarData } from "../../../lib/api";
import { clockTime, londonDayMinutes, londonWallToIso, minutesToTime, timeToMinutes } from "../../../lib/calendarLayout";
import { shortDate } from "../../../lib/staffFormat";
import { Drawer, Segmented, errorMessage } from "../../../components/staff/ui";
import { BLOCK_LABEL } from "./shared";

const REASONS = (Object.keys(BLOCK_LABEL) as BlockReason[]).map((value) => ({ value, label: BLOCK_LABEL[value] }));

export function NewBlockDrawer({
  data,
  prefill,
  onClose,
  onSaved,
}: {
  data: CalendarData;
  prefill: { date: string; time: string; staffId: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const staff = data.staff.filter((s) => s.active && (data.can_view_all || s.id === data.own_staff_member_id));
  const [staffId, setStaffId] = useState(prefill.staffId ?? staff[0]?.id ?? "");
  const [date, setDate] = useState(prefill.date);
  const [from, setFrom] = useState(prefill.time);
  const [to, setTo] = useState(minutesToTime(Math.min(timeToMinutes(prefill.time) + 30, 23 * 60 + 55)));
  const [reason, setReason] = useState<BlockReason>("break");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await staffCreateTimeBlock({
        staff_member_id: staffId,
        location_id: data.location.id,
        start_at: londonWallToIso(date, from),
        end_at: londonWallToIso(date, to),
        reason,
        note: note || null,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Block time"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="st-btn st-btn--ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="button" className="st-btn" disabled={busy || !staffId || !date || !from || !to || to <= from} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <p className="st-hint">Clients can't book online over blocked time. Staff can still book over it, with a warning.</p>
      <div className="st-field">
        <label htmlFor="bl-staff">Who</label>
        <select id="bl-staff" className="st-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name}
            </option>
          ))}
        </select>
      </div>
      <div className="st-grid-3">
        <div className="st-field">
          <label htmlFor="bl-date">Date</label>
          <input id="bl-date" className="st-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="st-field">
          <label htmlFor="bl-from">From</label>
          <input id="bl-from" className="st-input" type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="st-field">
          <label htmlFor="bl-to">To</label>
          <input id="bl-to" className="st-input" type="time" step={300} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <div className="st-field">
        <span className="st-label">Reason</span>
        <Segmented label="Reason" value={reason} options={REASONS} onChange={setReason} />
      </div>
      <div className="st-field">
        <label htmlFor="bl-note">Note (optional)</label>
        <input id="bl-note" className="st-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="st-error">{error}</p>}
    </Drawer>
  );
}

export function BlockPanel({
  block,
  data,
  onClose,
  onDeleted,
}: {
  block: CalendarBlock;
  data: CalendarData;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = data.staff.find((s) => s.id === block.staff_member_id)?.display_name ?? "Unknown";

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await staffDeleteTimeBlock(block.id);
      onDeleted();
    } catch (e) {
      setError(errorMessage(e, "Could not remove"));
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={BLOCK_LABEL[block.reason]}
      onClose={onClose}
      footer={
        <button type="button" className="st-btn st-btn--danger" onClick={remove} disabled={busy}>
          {busy ? "Removing…" : "Remove blocked time"}
        </button>
      }
    >
      <dl className="st-panel-dl">
        <dt>Who</dt>
        <dd>{who}</dd>
        <dt>When</dt>
        <dd>
          {shortDate(londonDayMinutes(block.start_at).date)}, {clockTime(block.start_at)}–{clockTime(block.end_at)}
        </dd>
        {block.note && (
          <>
            <dt>Note</dt>
            <dd>{block.note}</dd>
          </>
        )}
      </dl>
      {error && <p className="st-error">{error}</p>}
    </Drawer>
  );
}
