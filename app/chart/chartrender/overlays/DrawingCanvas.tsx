"use client";

import { useRef, useEffect, useCallback } from "react";

export type DrawTool = "select"|"trendline"|"hline"|"rect"|"freehand"|"text"|"fibonacci";
export interface Point { x: number; y: number }

interface BaseShape { id: string; tool: DrawTool; color: string; lineWidth: number; selected?: boolean }
interface LineShape  extends BaseShape { tool: "trendline"; p1: Point; p2: Point }
interface HLineShape extends BaseShape { tool: "hline";     y: number }
interface RectShape  extends BaseShape { tool: "rect";      p1: Point; p2: Point }
interface FreeShape  extends BaseShape { tool: "freehand";  pts: Point[] }
interface TextShape  extends BaseShape { tool: "text";      p: Point; text: string }
interface FibShape   extends BaseShape { tool: "fibonacci"; p1: Point; p2: Point }
export type Shape = LineShape | HLineShape | RectShape | FreeShape | TextShape | FibShape;

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899"];
const uid = () => Math.random().toString(36).slice(2);

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, w: number) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle   = s.color;
  ctx.lineWidth   = s.selected ? s.lineWidth + 1.5 : s.lineWidth;
  ctx.setLineDash(s.selected ? [6,3] : []);
  switch (s.tool) {
    case "trendline": { ctx.beginPath(); ctx.moveTo(s.p1.x,s.p1.y); ctx.lineTo(s.p2.x,s.p2.y); ctx.stroke(); break; }
    case "hline":     { ctx.beginPath(); ctx.moveTo(0,s.y); ctx.lineTo(w,s.y); ctx.stroke(); break; }
    case "rect": {
      const rx=Math.min(s.p1.x,s.p2.x), ry=Math.min(s.p1.y,s.p2.y);
      const rw=Math.abs(s.p2.x-s.p1.x), rh=Math.abs(s.p2.y-s.p1.y);
      ctx.globalAlpha=0.15; ctx.fillRect(rx,ry,rw,rh); ctx.globalAlpha=1; ctx.strokeRect(rx,ry,rw,rh); break;
    }
    case "freehand": {
      if (s.pts.length<2) break;
      ctx.beginPath(); ctx.moveTo(s.pts[0].x,s.pts[0].y); s.pts.forEach(p=>ctx.lineTo(p.x,p.y)); ctx.stroke(); break;
    }
    case "text": { ctx.font=`${14*s.lineWidth}px Inter,sans-serif`; ctx.fillText(s.text,s.p.x,s.p.y); break; }
    case "fibonacci": {
      const dy=s.p2.y-s.p1.y;
      FIB_LEVELS.forEach((lvl,i)=>{
        const y=s.p1.y+dy*lvl;
        ctx.strokeStyle=FIB_COLORS[i]; ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle=FIB_COLORS[i];
        ctx.font="11px Inter,sans-serif"; ctx.fillText(`${(lvl*100).toFixed(1)}%`,s.p1.x+6,y-4);
      }); break;
    }
  }
  ctx.setLineDash([]);
}

export interface DrawingCanvasProps {
  tool: DrawTool;
  color: string;
  lineWidth: number;
  visible: boolean;
  drawingMode: boolean;
  shapes: Shape[];
  onShapesChange: (shapes: Shape[]) => void;
}

export default function DrawingCanvas({
  tool, color, lineWidth, visible, drawingMode, shapes, onShapesChange
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef  = useRef<Shape | null>(null);
  const drawingRef = useRef(false);

  // ── Redraw ────────────────────────────────────────────────────────────────
  const redraw = useCallback((draft?: Shape | null) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const all = [...shapes, ...(draft ? [draft] : [])];
    all.forEach(s => drawShape(ctx, s, canvas.width));
  }, [shapes]);

  useEffect(() => { redraw(); }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      redraw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  // ── Pointer ───────────────────────────────────────────────────────────────
  const pt = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX-r.left, y: e.clientY-r.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingMode || tool === "select") return;
    const p = pt(e);
    drawingRef.current = true;
    if (tool === "text") {
      const label = window.prompt("Label:", "Price level") ?? ""; if (!label) return;
      onShapesChange([...shapes, { id:uid(), tool:"text", color, lineWidth, p, text:label }]); return;
    }
    if (tool === "hline") {
      onShapesChange([...shapes, { id:uid(), tool:"hline", color, lineWidth, y:p.y }]);
      drawingRef.current = false; return;
    }
    if (tool === "freehand") {
      draftRef.current = { id:uid(), tool:"freehand", color, lineWidth, pts:[p] };
      return;
    }
    draftRef.current = { id:uid(), tool:tool as "trendline"|"rect"|"fibonacci", color, lineWidth, p1:p, p2:p } as Shape;
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !draftRef.current) return;
    const p = pt(e);
    const d = draftRef.current;
    if (d.tool === "freehand") {
      draftRef.current = { ...d, pts:[...d.pts, p] };
    } else if (d.tool==="trendline"||d.tool==="rect"||d.tool==="fibonacci") {
      draftRef.current = { ...d, p2:p } as Shape;
    }
    redraw(draftRef.current);
  };

  const onUp = () => {
    if (draftRef.current) {
      onShapesChange([...shapes, draftRef.current]);
      draftRef.current = null;
    }
    drawingRef.current = false;
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        // When not in drawing mode, fully transparent to pointer events
        pointerEvents: (drawingMode && visible) ? "auto" : "none",
        cursor: tool === "select" ? "default" : "crosshair",
        display: visible ? "block" : "none",
        zIndex: 10,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    />
  );
}