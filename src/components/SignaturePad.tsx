import { useEffect, useRef } from "react";

interface Props {
  onChange: (dataUrl: string | null) => void;
}

type Point = { x: number; y: number };

// Built-in drawn signature for touch, stylus and mouse. Pointer Events do the
// drawing where supported; touch/mouse listeners are the fallback. Native,
// non-passive touch listeners stop iOS Safari from treating a finger on the
// pad as a page scroll or long-press (which cancels the stroke mid-signature).
export default function SignaturePad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size the drawing surface to the element. Done lazily too, in case the
    // pad was laid out at zero width when it first mounted.
    function fitCanvas() {
      const c = canvasRef.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      const rect = c.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (c.width === width && c.height === height) return;
      // Resizing wipes the canvas, so only do it before anything is drawn.
      if (hasDrawnRef.current) return;
      c.width = width;
      c.height = height;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#2b2422";
      ctx.fillStyle = "#2b2422";
    }

    function pointFrom(clientX: number, clientY: number): Point {
      const rect = canvas!.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function start(p: Point) {
      fitCanvas();
      drawingRef.current = true;
      lastPointRef.current = p;
      // A dot, so even a short tap leaves a mark.
      const ctx = canvas!.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      hasDrawnRef.current = true;
    }

    function move(p: Point) {
      if (!drawingRef.current || !lastPointRef.current) return;
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPointRef.current = p;
    }

    function end() {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      lastPointRef.current = null;
      if (hasDrawnRef.current) onChangeRef.current(canvas!.toDataURL("image/png"));
    }

    const supportsPointer = typeof window !== "undefined" && "PointerEvent" in window;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Not fatal: drawing still works without capture.
      }
      start(pointFrom(e.clientX, e.clientY));
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      // Coalesced events give a smoother line on fast finger strokes.
      const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) move(pointFrom(ev.clientX, ev.clientY));
    };
    const onPointerEnd = () => end();

    // Always block the browser's own touch handling on the pad (scroll,
    // zoom, text selection, long-press menu). Without pointer events, these
    // also do the drawing.
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (!supportsPointer && e.touches[0]) start(pointFrom(e.touches[0].clientX, e.touches[0].clientY));
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!supportsPointer && e.touches[0]) move(pointFrom(e.touches[0].clientX, e.touches[0].clientY));
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (!supportsPointer) end();
    };
    const onMouseDown = (e: MouseEvent) => start(pointFrom(e.clientX, e.clientY));
    const onMouseMove = (e: MouseEvent) => move(pointFrom(e.clientX, e.clientY));
    const onMouseUp = () => end();

    fitCanvas();
    window.addEventListener("resize", fitCanvas);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });
    if (supportsPointer) {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerEnd);
      canvas.addEventListener("pointercancel", onPointerEnd);
      canvas.addEventListener("lostpointercapture", onPointerEnd);
    } else {
      canvas.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }

    return () => {
      window.removeEventListener("resize", fitCanvas);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("lostpointercapture", onPointerEnd);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    hasDrawnRef.current = false;
    onChange(null);
  }

  return (
    <div>
      <canvas ref={canvasRef} className="kaaya-signature-canvas" role="img" aria-label="Signature drawing area" />
      <button type="button" className="kaaya-btn kaaya-btn--secondary" onClick={clear} style={{ marginTop: 10 }}>
        Clear Signature
      </button>
    </div>
  );
}
