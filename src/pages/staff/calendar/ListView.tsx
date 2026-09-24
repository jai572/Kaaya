import type { CSSProperties } from "react";
import type { CalendarAppointment, CalendarBlock, CalendarData } from "../../../lib/api";
import { clockTime, durationLabel, londonDayMinutes } from "../../../lib/calendarLayout";
import { shortDate } from "../../../lib/staffFormat";
import { apptTitle, BLOCK_LABEL, STATUS_CHIP, STATUS_LABEL, staffColour } from "./shared";

type Row = { kind: "a"; at: string; a: CalendarAppointment } | { kind: "b"; at: string; b: CalendarBlock };

export default function ListView({
  data,
  appointments,
  blocks,
  staffIds,
  onOpenAppointment,
  onOpenBlock,
}: {
  data: CalendarData;
  appointments: CalendarAppointment[];
  blocks: CalendarBlock[];
  staffIds: Set<string>;
  onOpenAppointment: (a: CalendarAppointment) => void;
  onOpenBlock: (b: CalendarBlock) => void;
}) {
  const staff = new Map(data.staff.map((s) => [s.id, s]));
  const rows: Row[] = [
    ...appointments.filter((a) => staffIds.has(a.staff_member_id)).map((a) => ({ kind: "a" as const, at: a.scheduled_at, a })),
    ...blocks.filter((b) => staffIds.has(b.staff_member_id)).map((b) => ({ kind: "b" as const, at: b.start_at, b })),
  ].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));

  return (
    <div className="st-card st-cal-list">
      {data.dates.map((date) => {
        const today = rows.filter((r) => londonDayMinutes(r.at).date === date);
        return (
          <section key={date}>
            <h3 className="st-cal-list-day">{shortDate(date)}</h3>
            {today.length === 0 && <p className="st-cal-list-empty">Nothing booked</p>}
            {today.map((r) =>
              r.kind === "a" ? (
                <button
                  key={r.a.id}
                  type="button"
                  className="st-cal-list-row"
                  data-status={r.a.status}
                  style={{ "--c": staffColour(staff.get(r.a.staff_member_id)?.colour) } as CSSProperties}
                  onClick={() => onOpenAppointment(r.a)}
                >
                  <span className="st-cal-list-main">
                    <b>
                      {apptTitle(r.a)}
                      {r.a.patch_test && <span className="st-appt-tag">PT</span>}
                    </b>
                    <span className="st-muted">
                      {r.a.service_name} ({staff.get(r.a.staff_member_id)?.display_name ?? "?"})
                    </span>
                  </span>
                  <span className="st-cal-list-time">
                    <b>{clockTime(r.a.scheduled_at)}</b>
                    <span className="st-muted">{durationLabel(Math.round((Date.parse(r.a.end_at) - Date.parse(r.a.scheduled_at)) / 60000))}</span>
                    {r.a.status !== "confirmed" && <span className={STATUS_CHIP[r.a.status]}>{STATUS_LABEL[r.a.status]}</span>}
                  </span>
                </button>
              ) : (
                <button key={r.b.id} type="button" className="st-cal-list-row st-cal-list-row--block" onClick={() => onOpenBlock(r.b)}>
                  <span className="st-cal-list-main">
                    <b>{BLOCK_LABEL[r.b.reason]}</b>
                    <span className="st-muted">{staff.get(r.b.staff_member_id)?.display_name ?? "?"}</span>
                  </span>
                  <span className="st-cal-list-time">
                    <b>{clockTime(r.b.start_at)}</b>
                    <span className="st-muted">until {clockTime(r.b.end_at)}</span>
                  </span>
                </button>
              )
            )}
          </section>
        );
      })}
    </div>
  );
}
