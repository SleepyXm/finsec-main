"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { type DrawTool, type Shape } from "@/app/chart/chartrender/overlays/DrawingCanvas";
import { theme } from "@/app/ui";
import { LeftBarSection } from "./LeftBarSection";
import { ChartAreaSection, ExtraChartSettings } from "./ChartAreaSection";
import { BottomPanelSection } from "./BottomPanelSection";
import { RightPanelSection, RightTab } from "./RightPanelSection";
import { ChartTheme } from "@/app/chart/chartrender/themes/themes";

const TOP_BAR_H   = 30;
const LEFT_BAR_W  = 48;
const BOTTOM_MIN_H    = 64;
const BOTTOM_MAX_H    = 500;
const BOTTOM_DEFAULT_H = 188;

const selectedBlurBg     = "rgba(238,242,247,0.085)";
const selectedBlurBorder = "rgba(238,242,247,0.26)";

interface TradeLayoutProps {
  topBar:       React.ReactNode;
  bottomPanel: React.ReactNode;
  primaryChart: React.ReactNode;
  extraChartSettings: ExtraChartSettings;
  chartTheme: ChartTheme;
}

export default function TradeLayout({
  topBar,
  bottomPanel,
  primaryChart,
  extraChartSettings,
  chartTheme,
}: TradeLayoutProps) {
  // ── drawing ──────────────────────────────────────────────────────────────
  const [drawingMode, setDrawingMode] = useState(false);
  const [shapes,      setShapes]      = useState<Shape[]>([]);
  const [drawTool,    setDrawTool]    = useState<DrawTool>("trendline");
  const [drawColor,   setDrawColor]   = useState<string>(theme.dark.accent);
  const [drawLW,      setDrawLW]      = useState(2);
  const [drawVisible, setDrawVisible] = useState(true);

  const handleUndo  = () => setShapes((s) => s.slice(0, -1));
  const handleClear = () => setShapes([]);

  // ── panels ───────────────────────────────────────────────────────────────
  const [rightOpen,      setRightOpen]      = useState(true);
  const [activeRightTab, setActiveRightTab] = useState<RightTab>("watchlist");
  const [bottomH,        setBottomH]        = useState(BOTTOM_DEFAULT_H);
  const bottomOpen = bottomH > BOTTOM_MIN_H;

  // ── extra charts (owned here, driven by right-panel "Add Chart" tab) ────
  const [extraSymbols, setExtraSymbols] = useState<string[]>([]);
  const handleAddChart    = (symbol: string) => setExtraSymbols((p) => [...p, symbol]);
  const handleRemoveChart = (i: number) =>
    setExtraSymbols((p) => { const n = [...p]; n.splice(i, 1); return n; });

  // ── bottom drag ──────────────────────────────────────────────────────────
  const draggingBottom = useRef(false);
  const dragStartY     = useRef(0);
  const dragStartH     = useRef(0);

  const onBottomDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingBottom.current = true;
    dragStartY.current     = e.clientY;
    dragStartH.current     = bottomH;
  }, [bottomH]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingBottom.current) return;
      const delta = dragStartY.current - e.clientY;
      setBottomH(Math.min(BOTTOM_MAX_H, Math.max(BOTTOM_MIN_H, dragStartH.current + delta)));
    };
    const onUp = () => { draggingBottom.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      width: "100vw", height: "calc(100dvh - 56px)", overflow: "hidden",
      background: theme.dark.bg, color: theme.dark.text, fontFamily: "inherit",
    }}>
      {/* ── top bar ───────────────────────────────────────────────────────── */}
      <div style={{
        height: TOP_BAR_H, minHeight: TOP_BAR_H,
        display: "flex", alignItems: "center",
        borderBottom: `1px solid ${theme.dark.borderSoft}`,
        background: "rgba(14,17,23,0.86)",
        zIndex: 50,
        paddingLeft: LEFT_BAR_W,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}>
        {topBar}

        {/* right-panel toggle */}
        <button
          onClick={() => setRightOpen((v) => !v)}
          title="Toggle panel"
          style={{
            marginLeft: "auto", marginRight: 8,
            width: 22, height: 22,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: rightOpen ? selectedBlurBg : "transparent",
            border: `1px solid ${rightOpen ? selectedBlurBorder : theme.dark.borderSoft}`,
            borderRadius: 0,
            cursor: "pointer",
            color: rightOpen ? theme.dark.text : theme.dark.muted2,
            flexShrink: 0,
            backdropFilter: rightOpen ? "blur(12px)" : undefined,
            WebkitBackdropFilter: rightOpen ? "blur(12px)" : undefined,
            transition: "background 0.16s ease, color 0.16s ease, border-color 0.16s ease",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <line x1="9" y1="1" x2="9" y2="13" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>

      {/* ── body ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* left + chart + bottom */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
            <LeftBarSection
              drawingMode={drawingMode} setDrawingMode={setDrawingMode}
              drawTool={drawTool}       setDrawTool={setDrawTool}
              drawColor={drawColor}     setDrawColor={setDrawColor}
              drawLW={drawLW}           setDrawLW={setDrawLW}
              drawVisible={drawVisible} setDrawVisible={setDrawVisible}
              handleUndo={handleUndo}   handleClear={handleClear}
            />
            <ChartAreaSection
              primaryChart={primaryChart}
              extraSymbols={extraSymbols}
              onRemoveChart={handleRemoveChart}
              drawTool={drawTool}       drawColor={drawColor}
              drawLW={drawLW}           drawVisible={drawVisible}
              drawingMode={drawingMode} shapes={shapes}
              setShapes={setShapes}
              extraChartSettings={extraChartSettings}
            />
          </div>

          <BottomPanelSection
            bottomH={bottomH}         bottomOpen={bottomOpen}
            draggingBottom={draggingBottom}
            onBottomDragStart={onBottomDragStart}
            bottomPanel={bottomPanel}
          />
        </div>

        {/* right panel */}
        <RightPanelSection
          rightOpen={rightOpen}         setRightOpen={setRightOpen}
          activeRightTab={activeRightTab} setActiveRightTab={setActiveRightTab}
          onAddChart={handleAddChart}
          chartTheme={chartTheme}
        />
      </div>
    </div>
  );
}
