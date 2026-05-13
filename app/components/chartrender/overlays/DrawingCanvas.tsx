
"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

type Tool =
  | "select"
  | "trendline"
  | "hline"
  | "rect"
  | "freehand"
  | "text"
  | "fibonacci";

interface Point { x: number; y: number }

interface BaseShape {
  id: string;
  tool: Tool;
  color: string;
  lineWidth: number;
  selected?: boolean;
}
interface LineShape    extends BaseShape { tool: "trendline"; p1: Point; p2: Point }
interface HLineShape   extends BaseShape { tool: "hline";     y: number }
interface RectShape    extends BaseShape { tool: "rect";      p1: Point; p2: Point }
interface FreeShape    extends BaseShape { tool: "freehand";  pts: Point[] }
interface TextShape    extends BaseShape { tool: "text";      p: Point; text: string }
interface FibShape     extends BaseShape { tool: "fibonacci"; p1: Point; p2: Point }

type Shape = LineShape | HLineShape | RectShape | FreeShape | TextShape | FibShape;

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899"];

// ── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2);

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, w: number) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle   = s.color;
  ctx.lineWidth   = s.selected ? s.lineWidth + 1.5 : s.lineWidth;
  ctx.setLineDash(s.selected ? [6, 3] : []);

  switch (s.tool) {
    case "trendline": {
      ctx.beginPath();
      ctx.moveTo(s.p1.x, s.p1.y);
      ctx.lineTo(s.p2.x, s.p2.y);
      ctx.stroke();
      break;
    }
    case "hline": {
      ctx.beginPath();
      ctx.moveTo(0, s.y);
      ctx.lineTo(w, s.y);
      ctx.stroke();
      break;
    }
    case "rect": {
      const rx = Math.min(s.p1.x, s.p2.x);
      const ry = Math.min(s.p1.y, s.p2.y);
      const rw = Math.abs(s.p2.x - s.p1.x);
      const rh = Math.abs(s.p2.y - s.p1.y);
      ctx.globalAlpha = 0.15;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.globalAlpha = 1;
      ctx.strokeRect(rx, ry, rw, rh);
      break;
    }
    case "freehand": {
      if (s.pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      s.pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      break;
    }
    case "text": {
      ctx.font = `${14 * s.lineWidth}px Inter, sans-serif`;
      ctx.fillText(s.text, s.p.x, s.p.y);
      break;
    }
    case "fibonacci": {
      const dy = s.p2.y - s.p1.y;
      FIB_LEVELS.forEach((lvl, i) => {
        const y = s.p1.y + dy * lvl;
        ctx.strokeStyle = FIB_COLORS[i];
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = FIB_COLORS[i];
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText(`${(lvl * 100).toFixed(1)}%`, s.p1.x + 6, y - 4);
      });
      break;
    }
  }
  ctx.setLineDash([]);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DrawingCanvas() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [tool, setTool]       = useState<Tool>("trendline");
  const [color, setColor]     = useState("#3b82f6");
  const [lineWidth, setLW]    = useState(2);
  const [shapes, setShapes]   = useState<Shape[]>([]);
  const [draft, setDraft]     = useState<Shape | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [visible, setVisible] = useState(true);
  const textRef = useRef<string>("");

  // redraw
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    [...shapes, ...(draft ? [draft] : [])].forEach(s => drawShape(ctx, s, canvas.width));
  }, [shapes, draft]);

  useEffect(() => { redraw(); }, [redraw]);

  // resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      redraw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  // ── Pointer helpers ──────────────────────────────────────────────────────

  const pt = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "select") return;
    const p = pt(e);
    setDrawing(true);

    if (tool === "text") {
      const label = window.prompt("Label:", "Price level") ?? "";
      if (!label) return;
      setShapes(prev => [...prev, { id: uid(), tool: "text", color, lineWidth, p, text: label }]);
      return;
    }
    if (tool === "hline") {
      setShapes(prev => [...prev, { id: uid(), tool: "hline", color, lineWidth, y: p.y }]);
      setDrawing(false);
      return;
    }
    if (tool === "freehand") {
      setDraft({ id: uid(), tool: "freehand", color, lineWidth, pts: [p] });
      return;
    }
    // trendline, rect, fibonacci
    setDraft({ id: uid(), tool: tool as "trendline"|"rect"|"fibonacci", color, lineWidth, p1: p, p2: p } as Shape);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !draft) return;
    const p = pt(e);
    if (draft.tool === "freehand") {
      setDraft(d => d && d.tool === "freehand" ? { ...d, pts: [...d.pts, p] } : d);
    } else if (draft.tool === "trendline" || draft.tool === "rect" || draft.tool === "fibonacci") {
      setDraft(d => d ? { ...d, p2: p } as Shape : d);
    }
  };

  const onUp = () => {
    if (draft) { setShapes(prev => [...prev, draft]); setDraft(null); }
    setDrawing(false);
  };

  const undo = () => setShapes(s => s.slice(0, -1));
  const clear = () => { setShapes([]); setDraft(null); };

  // ── UI ───────────────────────────────────────────────────────────────────

  const tools: { id: Tool; label: string; icon: string }[] = [
    { id: "select",    label: "Select",    icon: "↖" },
    { id: "trendline", label: "Trendline", icon: "╱" },
    { id: "hline",     label: "H-Level",   icon: "—" },
    { id: "rect",      label: "Rectangle", icon: "▭" },
    { id: "freehand",  label: "Freehand",  icon: "✏" },
    { id: "text",      label: "Text",      icon: "T" },
    { id: "fibonacci", label: "Fibonacci", icon: "φ" },
  ];

  return (
    <div
      style={{
        position: "absolute", inset: 0,
        pointerEvents: visible ? "auto" : "none",
        zIndex: 10,
      }}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          cursor: tool === "select" ? "default" : "crosshair",
          display: visible ? "block" : "none",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />

      {/* Toolbar */}
      <div
        style={{
          position: "absolute", top: 12, left: 12,
          background: "rgba(17,24,39,0.92)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          padding: "8px 6px",
          display: "flex", flexDirection: "column", gap: 4,
          backdropFilter: "blur(8px)",
          pointerEvents: "auto",
          zIndex: 20,
        }}
      >
        {tools.map(t => (
          <button
            key={t.id}
            title={t.label}
            onClick={() => setTool(t.id)}
            style={{
              width: 36, height: 36,
              borderRadius: 6,
              border: "none",
              background: tool === t.id ? "#3b82f6" : "transparent",
              color: "#e5e7eb",
              fontSize: 16,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {t.icon}
          </button>
        ))}

        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.1)", margin: "4px 0" }} />

        {/* Color picker */}
        <input
          type="color"
          value={color}
          onChange={e => setColor(e.target.value)}
          title="Color"
          style={{ width: 36, height: 28, border: "none", background: "none", cursor: "pointer", padding: 0 }}
        />

        {/* Line width */}
        <select
          value={lineWidth}
          onChange={e => setLW(Number(e.target.value))}
          title="Line width"
          style={{
            width: 36, background: "rgba(30,40,55,0.9)",
            color: "#e5e7eb", border: "none", borderRadius: 4, fontSize: 11, padding: "2px 0",
          }}
        >
          {[1,2,3,4].map(n => <option key={n} value={n}>{n}px</option>)}
        </select>

        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.1)", margin: "4px 0" }} />

        {/* Undo */}
        <button title="Undo" onClick={undo}
          style={{ width: 36, height: 32, borderRadius: 6, border: "none", background: "transparent", color: "#e5e7eb", cursor: "pointer", fontSize: 15 }}>
          ↩
        </button>

        {/* Clear */}
        <button title="Clear all" onClick={clear}
          style={{ width: 36, height: 32, borderRadius: 6, border: "none", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: 14 }}>
          🗑
        </button>

        {/* Toggle visibility */}
        <button title={visible ? "Hide drawings" : "Show drawings"} onClick={() => setVisible(v => !v)}
          style={{ width: 36, height: 32, borderRadius: 6, border: "none", background: "transparent", color: "#e5e7eb", cursor: "pointer", fontSize: 15 }}>
          {visible ? "👁" : "🚫"}
        </button>
      </div>
    </div>
  );
}