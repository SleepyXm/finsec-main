"use client";

import { useRef, useState, useCallback, useEffect } from "react";
 
const TOP_BAR_H = 40;
const LEFT_BAR_W = 48;
const RIGHT_PANEL_W = 280;
const BOTTOM_MIN_H = 64;   // collapsed — just the tab bar
const BOTTOM_MAX_H = 500;
const BOTTOM_DEFAULT_H = 330;
 
interface TradeLayoutProps {
  topBar?: React.ReactNode;
  leftBar?: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  children: (dims: { width: number; height: number }) => React.ReactNode;
}
 
export default function TradeLayout({
  topBar,
  leftBar,
  rightPanel,
  bottomPanel,
  children,
}: TradeLayoutProps) {
  const [rightOpen, setRightOpen] = useState(false);
  const [bottomH, setBottomH] = useState(BOTTOM_DEFAULT_H);
  const bottomOpen = bottomH > BOTTOM_MIN_H;
 
  const draggingBottom = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);
 
  // ── bottom drag ──────────────────────────────────────────────
  const onBottomDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingBottom.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = bottomH;
  }, [bottomH]);
 
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingBottom.current) return;
      const delta = dragStartY.current - e.clientY; // drag up = positive
      const next = Math.min(BOTTOM_MAX_H, Math.max(BOTTOM_MIN_H, dragStartH.current + delta));
      setBottomH(next);
    };
    const onUp = () => { draggingBottom.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
 
  // ── chart dims ───────────────────────────────────────────────
  const rightW = rightOpen ? RIGHT_PANEL_W : 0;
  const chartW = `calc(100vw - ${LEFT_BAR_W}px - ${rightW}px)`;
  const chartH = `calc(100vh - ${TOP_BAR_H}px - ${bottomH}px)`;
 
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#0f1117",

      }}
    >
      {/* ── TOP BAR ──────────────────────────────────────────── */}
      <div
        style={{
          height: TOP_BAR_H,
          minHeight: TOP_BAR_H,
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid #1e2130",
          background: "#0f1117",
          zIndex: 50,
          paddingLeft: LEFT_BAR_W,
        }}
      >
        {topBar}
 
        {/* right panel toggle — lives in top bar far right */}
        <button
          onClick={() => setRightOpen((v) => !v)}
          title="Toggle order panel"
          style={{
            marginLeft: "auto",
            marginRight: 8,
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: rightOpen ? "#1e2130" : "transparent",
            border: "1px solid #1e2130",
            borderRadius: 4,
            cursor: "pointer",
            color: "#6b7280",
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <line x1="9" y1="1" x2="9" y2="13" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
 
      {/* ── MIDDLE ROW (left bar + chart + right panel) ───────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
 
        {/* ── LEFT BAR ─────────────────────────────────────── */}
        <div
          style={{
            width: LEFT_BAR_W,
            minWidth: LEFT_BAR_W,
            borderRight: "1px solid #1e2130",
            background: "#0f1117",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 8,
            gap: 4,
            zIndex: 40,
          }}
        >
          {leftBar ?? <LeftBarPlaceholder />}
        </div>
 
        {/* ── CHART AREA ───────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {children({ width: 0, height: 0 })}
          {/* width/height passed as 0 — chart uses 100%/100% of parent,
              lightweight charts auto-resizes via ResizeObserver inside useChart */}
        </div>
 
        {/* ── RIGHT PANEL ──────────────────────────────────── */}
        <div
          style={{
            width: rightOpen ? RIGHT_PANEL_W : 0,
            minWidth: rightOpen ? RIGHT_PANEL_W : 0,
            overflow: "hidden",
            borderLeft: "1px solid #1e2130",
            background: "#0f1117",
            transition: "width 180ms ease, min-width 180ms ease",
            display: "flex",
            flexDirection: "column",
            zIndex: 40,
          }}
        >
          {rightOpen && (
            <div style={{ width: RIGHT_PANEL_W, height: "100%", overflowY: "auto" }}>
              {rightPanel ?? <RightPanelPlaceholder />}
            </div>
          )}
        </div>
      </div>
 
      {/* ── BOTTOM PANEL ─────────────────────────────────────── */}
      <div
        style={{
          height: bottomH,
          minHeight: bottomH,
          borderTop: "1px solid #1e2130",
          background: "#0f1117",
          display: "flex",
          flexDirection: "column",
          zIndex: 40,
          transition: draggingBottom.current ? "none" : "height 120ms ease",
        }}
      >
        {/* drag handle */}
        <div
          onMouseDown={onBottomDragStart}
          style={{
            height: 4,
            cursor: "ns-resize",
            background: "transparent",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 32,
              height: 3,
              borderRadius: 2,
              background: "#2a2e3a",
            }}
          />
        </div>
 
        {/* tab strip — always visible, clicking opens panel */}
 
        {/* scrollable content */}
        {bottomOpen && (
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
            {bottomPanel ?? <BottomPanelPlaceholder />}
          </div>
        )}
      </div>
    </div>
  );
}
 
// ── small sub-components ──────────────────────────────────────────
 
function BottomTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0 14px",
        height: "100%",
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
        color: active ? "#e2e8f0" : "#6b7280",
        fontSize: 11,
        cursor: "pointer",
        fontFamily: "inherit",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}
 
function LeftBarPlaceholder() {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            background: "#1a1f2e",
            border: "1px solid #1e2130",
          }}
        />
      ))}
    </>
  );
}
 
function RightPanelPlaceholder() {
  return (
    <div style={{ padding: 16, color: "#6b7280", fontSize: 12, fontFamily: "inherit" }}>
      Order panel coming soon
    </div>
  );
}
 
function BottomPanelPlaceholder() {
  return (
    <div style={{ color: "#6b7280", fontSize: 12, fontFamily: "inherit" }}>
      Panel content goes here
    </div>
  );
}
