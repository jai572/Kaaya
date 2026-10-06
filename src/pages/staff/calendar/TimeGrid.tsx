import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { CalendarAppointment, CalendarBlock, CalendarShift } from "../../../lib/api";
import {
  anchoredScroll,
  clampZoom,
  clockTime,
  durationLabel,
  hourLabel,
  layoutLanes,
  londonDayMinutes,
  timeToMinutes,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../../../lib/calendarLayout";
import { apptTitle, BLOCK_LABEL, staffColour } from "./shared";

const BASE_PX_PER_MIN = 1.6; // zoom 1: 96px an hour; a 5-minute threading slot is 8px
const MIN_BLOCK_PX = 24;
const AXIS_PX = 56;
const MIN_COLUMN_PX = 80;
const ZOOM_STEP = 1.25;

type Anchor = { viewX: number; viewY: number; scrollLeft: number; scrollTop: number; gridWidth: number; zoom: number };

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
  zoom,
  onZoomChange,
}: {
  minColumnWidth?: number;
  /** 1 = 96px an hour. Scales hour height and column width together. */
  zoom: number;
  onZoomChange: (zoom: number) => void;
  columns: GridColumn[];
  window: { start: number; end: number };
  colourFor: (staffId: string) => string;
  onOpenAppointment: (a: CalendarAppointment) => void;
  onOpenBlock: (b: CalendarBlock) => void;
  onEmptyClick: (column: GridColumn, minutes: number) => void;
}) {
  const now = useNowMinutes();
  const PX_PER_MIN = BASE_PX_PER_MIN * zoom;
  const columnPx = Math.max(MIN_COLUMN_PX, Math.round(minColumnWidth * zoom));
  const height = (win.end - win.start) * PX_PER_MIN;

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const anchorRef = useRef<Anchor | null>(null);

  /** Change zoom keeping the content under (clientX, clientY) -- or the
   * middle of the calendar -- where it is on screen. */
  const zoomTo = useCallback(
    (target: number, clientX?: number, clientY?: number) => {
      const el = scrollRef.current;
      const grid = gridRef.current;
      const next = clampZoom(target);
      if (!el || !grid || Math.abs(next - zoomRef.current) < 0.005) return;
      const rect = el.getBoundingClientRect();
      if (!anchorRef.current) {
        anchorRef.current = {
          viewX: clientX === undefined ? el.clientWidth / 2 : clientX - rect.left,
          viewY: clientY === undefined ? el.clientHeight / 2 : clientY - rect.top,
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
          gridWidth: grid.offsetWidth,
          zoom: zoomRef.current,
        };
      }
      onZoomChange(next);
    },
    [onZoomChange]
  );

  // After the grid re-renders at the new scale, scroll so the anchor point stays put.
  useLayoutEffect(() => {
    const a = anchorRef.current;
    const el = scrollRef.current;
    const grid = gridRef.current;
    if (!a || !el || !grid) return;
    anchorRef.current = null;
    const head = (grid.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
    const widthRatio = (grid.offsetWidth - AXIS_PX) / Math.max(1, a.gridWidth - AXIS_PX);
    el.scrollTop = anchoredScroll({ scroll: a.scrollTop, view: a.viewY, lead: head, ratio: zoom / a.zoom });
    el.scrollLeft = anchoredScroll({ scroll: a.scrollLeft, view: a.viewX, lead: AXIS_PX, ratio: widthRatio });
  }, [zoom]);

  // Two-finger pinch (phones, tablets) and trackpad pinch (ctrl + wheel) zoom
  // the calendar itself instead of the whole page.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let pinch: { dist: number; zoom: number } | null = null;
    let frame = 0;
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { dist: distance(e.touches) || 1, zoom: zoomRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const t = e.touches;
      const target = pinch.zoom * (distance(t) / pinch.dist);
      const midX = (t[0].clientX + t[1].clientX) / 2;
      const midY = (t[0].clientY + t[1].clientY) / 2;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => zoomTo(target, midX, midY));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // plain wheel / two-finger swipe scrolls as normal
      e.preventDefault();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    const stopSafariPageZoom = (e: Event) => e.preventDefault();
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", stopSafariPageZoom);
    el.addEventListener("gesturechange", stopSafariPageZoom);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", stopSafariPageZoom);
      el.removeEventListener("gesturechange", stopSafariPageZoom);
    };
  }, [zoomTo]);
  const hours: number[] = [];
  for (let m = win.start; m < win.end; m += 60) hours.push(m);

  function handleEmpty(e: MouseEvent<HTMLDivElement>, col: GridColumn) {
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = win.start + Math.floor((e.clientY - rect.top) / PX_PER_MIN / 5) * 5;
    onEmptyClick(col, Math.max(win.start, Math.min(win.end - 5, minutes)));
  }

  return (
    <div className="st-cal-frame">
    <div className="st-cal-scroll" ref={scrollRef}>
      <div
        className="st-cal-grid"
        ref={gridRef}
        style={{ gridTemplateColumns: `${AXIS_PX}px repeat(${columns.length}, minmax(${columnPx}px, 1fr))`, "--hour": `${60 * PX_PER_MIN}px` } as CSSProperties}
      >
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
      <div className="st-cal-zoom" role="group" aria-label="Calendar zoom">
        <button type="button" aria-label="Zoom out" onClick={() => zoomTo(zoom / ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>
          −
        </button>
        <button type="button" aria-label="Reset zoom" title="Reset zoom" onClick={() => zoomTo(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomTo(zoom * ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
          +
        </button>
      </div>
    </div>
  );
}
