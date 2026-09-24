import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import type { CalendarAppointment, CalendarBlock, CalendarShift } from "../../../lib/api";
import { clockTime, durationLabel, hourLabel, layoutLanes, londonDayMinutes, timeToMinutes } from "../../../lib/calendarLayout";
import { apptTitle, BLOCK_LABEL, staffColour } from "./shared";

export const PX_PER_MIN = 1.6; // 96px an hour; a 5-minute threading slot is 8px
const MIN_BLOCK_PX = 24;

export interface GridColumn {
  key: string;
  title: string;
  subtitle: string;
  colour?: string | null;
  date: string;
  staffId: string;
  shift: CalendarShift | null;
  appointments: CalendarAppointment[];
  blocks: CalendarBlock[];
  isToday: boolean;
}

function useNowMinutes(): number {
  const [now, setNow] = useState(() => londonDayMinutes(new Date().toISOString()).minutes);
  useEffect(() => {
    const t = window.setInterval(() => setNow(londonDayMinutes(new Date().toISOString()).minutes), 60000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export default function TimeGrid({
  columns,
  window: win,
  colourFor,
  onOpenAppointment,
  onOpenBlock,
  onEmptyClick,
  minColumnWidth = 148,
}: {
  minColumnWidth?: number;
  columns: GridColumn[];
  window: { start: number; end: number };
  colourFor: (staffId: string) => string;
  onOpenAppointment: (a: CalendarAppointment) => void;
  onOpenBlock: (b: CalendarBlock) => void;
  onEmptyClick: (column: GridColumn, minutes: number) => void;
}) {
  const now = useNowMinutes();
  const height = (win.end - win.start) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = win.start; m < win.end; m += 60) hours.push(m);

  function handleEmpty(e: MouseEvent<HTMLDivElement>, col: GridColumn) {
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = win.start + Math.floor((e.clientY - rect.top) / PX_PER_MIN / 5) * 5;
    onEmptyClick(col, Math.max(win.start, Math.min(win.end - 5, minutes)));
  }

  return (
    <div className="st-cal-scroll">
      <div className="st-cal-grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(${minColumnWidth}px, 1fr))` }}>
        <div className="st-cal-corner" />
        {columns.map((col) => (
          <div key={col.key} className={`st-cal-colhead${col.isToday ? " st-cal-colhead--today" : ""}`}>
            <span className="st-cal-colhead-title">
              {col.colour && <span className="st-dot" style={{ "--dot": col.colour } as CSSProperties} />}
              {col.title}
            </span>
            <span className="st-cal-colhead-sub">{col.subtitle}</span>
          </div>
        ))}

        <div className="st-cal-axis" style={{ height }}>
          {hours.map((m) => (
            <span key={m} style={{ top: (m - win.start) * PX_PER_MIN }}>
              {hourLabel(m)}
            </span>
          ))}
        </div>

        {columns.map((col) => {
          const items = [
            ...col.appointments.map((a) => {
              const s = londonDayMinutes(a.scheduled_at).minutes;
              const e = s + Math.max(5, Math.round((Date.parse(a.end_at) - Date.parse(a.scheduled_at)) / 60000));
              return { id: `a:${a.id}`, start: s, end: e };
            }),
            ...col.blocks.map((b) => {
              const s = londonDayMinutes(b.start_at).minutes;
              const e = s + Math.round((Date.parse(b.end_at) - Date.parse(b.start_at)) / 60000);
              return { id: `b:${b.id}`, start: s, end: e };
            }),
          ];
          // Short items are drawn taller than their time, so lay out using the drawn height.
          const drawn = items.map((i) => ({ ...i, end: Math.max(i.end, i.start + MIN_BLOCK_PX / PX_PER_MIN) }));
          const lanes = layoutLanes(drawn);
          const pos = (id: string, start: number, end: number): CSSProperties => {
            const l = lanes.get(id) ?? { lane: 0, lanes: 1 };
            return {
              top: (start - win.start) * PX_PER_MIN,
              height: Math.max(MIN_BLOCK_PX, (end - start) * PX_PER_MIN) - 2,
              left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`,
              width: `calc(${100 / l.lanes}% - 4px)`,
            };
          };
          const byId = new Map(items.map((i) => [i.id, i]));

          return (
            <div
              key={col.key}
              className={`st-cal-col${col.shift ? "" : " st-cal-col--off"}`}
              style={{ height }}
              onClick={(e) => handleEmpty(e, col)}
            >
              {col.shift && (
                <div
                  className="st-cal-shift"
                  style={{
                    top: (timeToMinutes(col.shift.startTime) - win.start) * PX_PER_MIN,
                    height: (timeToMinutes(col.shift.endTime) - timeToMinutes(col.shift.startTime)) * PX_PER_MIN,
                  }}
                />
              )}

              {col.blocks.map((b) => {
                const it = byId.get(`b:${b.id}`)!;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className="st-cal-block"
                    style={pos(it.id, it.start, it.end)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenBlock(b);
                    }}
                  >
                    <b>{BLOCK_LABEL[b.reason]}</b> <span>{clockTime(b.start_at)}</span>
                  </button>
                );
              })}

              {col.appointments.map((a) => {
                const it = byId.get(`a:${a.id}`)!;
                const px = (it.end - it.start) * PX_PER_MIN;
                const style = { ...pos(it.id, it.start, it.end), "--c": staffColour(colourFor(a.staff_member_id)) } as CSSProperties;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="st-appt"
                    data-status={a.status}
                    style={style}
                    title={`${apptTitle(a)} · ${clockTime(a.scheduled_at)} · ${a.service_name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAppointment(a);
                    }}
                  >
                    <span className="st-appt-line">
                      <b>{apptTitle(a)}</b>
                      {a.patch_test && <span className="st-appt-tag" title="Patch test needed">PT</span>}
                      {a.visit_id && <span className="st-appt-tag" title="Part of a visit with other staff">+</span>}
                      {px < 40 && <span className="st-appt-sub"> · {a.service_name}</span>}
                    </span>
                    {px >= 40 && (
                      <span className="st-appt-sub">
                        {clockTime(a.scheduled_at)} · {durationLabel(it.end - it.start)}
                      </span>
                    )}
                    {px >= 56 && <span className="st-appt-sub st-appt-svc">{a.service_name}</span>}
                  </button>
                );
              })}

              {col.isToday && now >= win.start && now <= win.end && (
                <div className="st-cal-now" style={{ top: (now - win.start) * PX_PER_MIN }} aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
