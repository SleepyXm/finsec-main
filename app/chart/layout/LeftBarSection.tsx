"use client";

import type React from "react";
import { ColorPicker } from "@/app/chart/chartrender/overlays/ColorPicker";
import { Row } from "@/app/chart/chartrender/overlays/ThemeSettings";
import { DANGER, theme } from "@/app/components/UI/UI";

export type DrawTool =
  | "select" | "trendline" | "hline" | "rect"
  | "freehand" | "text" | "fibonacci";

const DRAW_TOOLS: { id: DrawTool; label: string; icon: string }[] = [
  { id: "select",    label: "Select",    icon: "↖" },
  { id: "trendline", label: "Trendline", icon: "╱" },
  { id: "hline",     label: "H-Level",   icon: "—" },
  { id: "rect",      label: "Rectangle", icon: "▭" },
  { id: "freehand",  label: "Freehand",  icon: "✏" },
  { id: "text",      label: "Text",      icon: "T" },
  { id: "fibonacci", label: "Fibonacci", icon: "φ" },
];

const selectedBlurBg     = "rgba(238,242,247,0.085)";
const selectedBlurBorder = "rgba(238,242,247,0.26)";
const idleBg             = "rgba(238,242,247,0.025)";
const dividerStyle: React.CSSProperties = {
  width: 28, height: 1, background: theme.dark.borderSoft, margin: "4px 0", flexShrink: 0,
};

function toolButtonStyle({ active, danger = false }: { active?: boolean; danger?: boolean }): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 0,
    border:      active ? `1px solid ${selectedBlurBorder}` : "1px solid transparent",
    background:  active ? selectedBlurBg : "transparent",
    color:       active ? theme.dark.text : danger ? DANGER : theme.dark.muted2,
    fontSize: 14, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    backdropFilter:       active ? "blur(12px)" : undefined,
    WebkitBackdropFilter: active ? "blur(12px)" : undefined,
    transition: "background 0.16s ease, color 0.16s ease, border-color 0.16s ease",
  };
}

interface LeftBarSectionProps {
  leftBar?:     React.ReactNode;
  drawingMode:  boolean;
  setDrawingMode: React.Dispatch<React.SetStateAction<boolean>>;
  drawTool:     DrawTool;
  setDrawTool:  React.Dispatch<React.SetStateAction<DrawTool>>;
  drawColor:    string;
  setDrawColor: React.Dispatch<React.SetStateAction<string>>;
  drawLW:       number;
  setDrawLW:    React.Dispatch<React.SetStateAction<number>>;
  drawVisible:  boolean;
  setDrawVisible: React.Dispatch<React.SetStateAction<boolean>>;
  handleUndo:   () => void;
  handleClear:  () => void;
}

export function LeftBarSection({
  leftBar, drawingMode, setDrawingMode,
  drawTool, setDrawTool, drawColor, setDrawColor,
  drawLW, setDrawLW, drawVisible, setDrawVisible,
  handleUndo, handleClear,
}: LeftBarSectionProps) {
  return (
    <div style={{
      width: 48, minWidth: 48,
      borderRight: `1px solid ${theme.dark.borderSoft}`,
      background: "rgba(14,17,23,0.86)",
      display: "flex", flexDirection: "column", alignItems: "center",
      paddingTop: 8, paddingBottom: 8, gap: 2,
      zIndex: 40, overflowY: "auto",
    }}>
      {leftBar}

      {DRAW_TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => { setDrawTool(t.id); setDrawingMode(t.id !== "select"); }}
          style={toolButtonStyle({ active: drawTool === t.id })}
        >
          {t.icon}
        </button>
      ))}

      {/* pan / draw mode toggle */}
      <div style={{
        display: "flex", flexDirection: "column",
        width: 32, borderRadius: 0,
        border: `1px solid ${theme.dark.borderSoft}`,
        overflow: "hidden", flexShrink: 0,
        margin: "4px 0", background: idleBg,
      }}>
        <button
          title="Pan & zoom"
          onClick={() => setDrawingMode(false)}
          style={{
            height: 26, border: "none",
            background: !drawingMode ? selectedBlurBg : "transparent",
            color:      !drawingMode ? theme.dark.text : theme.dark.muted2,
            cursor: "pointer", fontSize: 13,
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter:       !drawingMode ? "blur(12px)" : undefined,
            WebkitBackdropFilter: !drawingMode ? "blur(12px)" : undefined,
          }}
        >↕</button>
        <button
          title="Draw mode"
          onClick={() => setDrawingMode(true)}
          style={{
            height: 26, border: "none",
            borderTop: `1px solid ${theme.dark.borderSoft}`,
            background: drawingMode ? selectedBlurBg : "transparent",
            color:      drawingMode ? theme.dark.text : theme.dark.muted2,
            cursor: "pointer", fontSize: 13,
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter:       drawingMode ? "blur(12px)" : undefined,
            WebkitBackdropFilter: drawingMode ? "blur(12px)" : undefined,
          }}
        >✏</button>
      </div>

      <div style={dividerStyle} />

      {/* colour picker */}
      <Row label="">
        <div style={{
          position: "relative", width: 36, height: 20, overflow: "hidden",
          border: `1px solid ${theme.dark.borderSoft}`,
        }}>
          <div style={{ position: "absolute", inset: 0, background: drawColor }} />
          <ColorPicker value={drawColor} onChange={setDrawColor} />
        </div>
      </Row>

      {/* line width */}
      <select
        value={drawLW}
        onChange={(e) => setDrawLW(Number(e.target.value))}
        title="Line width"
        style={{
          width: 34,
          background: theme.dark.bg, color: theme.dark.muted2,
          border: `1px solid ${theme.dark.borderSoft}`,
          borderRadius: 0, fontSize: 10, padding: "1px 0",
          flexShrink: 0, outline: "none",
        }}
      >
        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}px</option>)}
      </select>

      <div style={dividerStyle} />

      <button title="Undo"      onClick={handleUndo}  style={toolButtonStyle({})}>↩</button>
      <button title="Clear all" onClick={handleClear} style={toolButtonStyle({ danger: true })}>🗑</button>
      <button
        title={drawVisible ? "Hide drawings" : "Show drawings"}
        onClick={() => setDrawVisible((v) => !v)}
        style={toolButtonStyle({ active: drawVisible })}
      >
        {drawVisible ? "👁" : "🚫"}
      </button>
    </div>
  );
}