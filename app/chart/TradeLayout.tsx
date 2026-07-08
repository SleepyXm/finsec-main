"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type React from "react";
import DrawingCanvas from "@/app/chart/chartrender/overlays/DrawingCanvas";
import { Shape } from "@/app/chart/chartrender/overlays/DrawingCanvas";
import { ColorPicker } from "@/app/chart/chartrender/overlays/ColorPicker";
import { Row } from "@/app/chart/chartrender/overlays/ThemeSettings";
import {
  DANGER,
  cornerStyle,
  pageStyle,
  panelStyle,
  theme,
} from "@/app/components/UI/UI";

const TOP_BAR_H = 40;
const LEFT_BAR_W = 48;
const RIGHT_PANEL_W = 560;
const BOTTOM_MIN_H = 64;
const BOTTOM_MAX_H = 500;
const BOTTOM_DEFAULT_H = 360;

const selectedBlurBg = "rgba(238,242,247,0.085)";
const selectedBlurBorder = "rgba(238,242,247,0.26)";
const hoverBg = "rgba(238,242,247,0.055)";
const idleBg = "rgba(238,242,247,0.025)";

const tradeShellStyle: React.CSSProperties = {
  ...pageStyle,
  display: "flex",
  flexDirection: "column",
  width: "100vw",
  height: "100vh",
  overflow: "hidden",
};

const surfacePanelStyle: React.CSSProperties = {
  ...panelStyle(theme.dark),
};

const dividerStyle: React.CSSProperties = {
  width: 28,
  height: 1,
  background: theme.dark.borderSoft,
  margin: "4px 0",
  flexShrink: 0,
};

const selectedGlassStyle = (active: boolean): React.CSSProperties =>
  active
    ? {
        background: selectedBlurBg,
        borderColor: selectedBlurBorder,
        color: theme.dark.text,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }
    : {};

const toolButtonStyle = ({
  active,
  danger = false,
}: {
  active?: boolean;
  danger?: boolean;
}): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: 0,
  border: active ? `1px solid ${selectedBlurBorder}` : "1px solid transparent",
  background: active ? selectedBlurBg : "transparent",
  color: active ? theme.dark.text : danger ? DANGER : theme.dark.muted2,
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  backdropFilter: active ? "blur(12px)" : undefined,
  WebkitBackdropFilter: active ? "blur(12px)" : undefined,
  transition: "background 0.16s ease, color 0.16s ease, border-color 0.16s ease",
});

type DrawTool =
  | "select"
  | "trendline"
  | "hline"
  | "rect"
  | "freehand"
  | "text"
  | "fibonacci";

const DRAW_TOOLS: { id: DrawTool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "↖" },
  { id: "trendline", label: "Trendline", icon: "╱" },
  { id: "hline", label: "H-Level", icon: "—" },
  { id: "rect", label: "Rectangle", icon: "▭" },
  { id: "freehand", label: "Freehand", icon: "✏" },
  { id: "text", label: "Text", icon: "T" },
  { id: "fibonacci", label: "Fibonacci", icon: "φ" },
];

type RightTab =
  | "watchlist"
  | "add-chart"
  | "strategy"
  | "backtest"
  | "indicators"
  | "tools"
  | "alerts"
  | "positions";

const RIGHT_TABS: { id: RightTab; label: string }[] = [
  { id: "add-chart", label: "Add Chart" },
  { id: "strategy", label: "Strategy" },
  { id: "backtest", label: "Backtest" },
  { id: "indicators", label: "Indicators" },
  { id: "watchlist", label: "Watchlist" },
  { id: "tools", label: "Tools" },
];

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
  const [drawingMode, setDrawingMode] = useState(false);
  const [shapes, setShapes] = useState<Shape[]>([]);

  const handleUndo = () => setShapes((s) => s.slice(0, -1));
  const handleClear = () => setShapes([]);

  const [rightOpen, setRightOpen] = useState(true);
  const [activeRightTab, setActiveRightTab] = useState<RightTab>("watchlist");
  const [bottomH, setBottomH] = useState(BOTTOM_DEFAULT_H);
  const bottomOpen = bottomH > BOTTOM_MIN_H;

  const [drawTool, setDrawTool] = useState<DrawTool>("trendline");
  const [drawColor, setDrawColor] = useState(theme.dark.accent);
  const [drawLW, setDrawLW] = useState(2);
  const [drawVisible, setDrawVisible] = useState(true);

  const draggingBottom = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  const onBottomDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingBottom.current = true;
      dragStartY.current = e.clientY;
      dragStartH.current = bottomH;
    },
    [bottomH]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingBottom.current) return;

      const delta = dragStartY.current - e.clientY;
      const next = Math.min(
        BOTTOM_MAX_H,
        Math.max(BOTTOM_MIN_H, dragStartH.current + delta)
      );

      setBottomH(next);
    };

    const onUp = () => {
      draggingBottom.current = false;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div style={tradeShellStyle}>
      <TopBarSection
        topBar={topBar}
        rightOpen={rightOpen}
        setRightOpen={setRightOpen}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <LeftBarSection
              leftBar={leftBar}
              drawingMode={drawingMode}
              setDrawingMode={setDrawingMode}
              drawTool={drawTool}
              setDrawTool={setDrawTool}
              drawColor={drawColor}
              setDrawColor={setDrawColor}
              drawLW={drawLW}
              setDrawLW={setDrawLW}
              drawVisible={drawVisible}
              setDrawVisible={setDrawVisible}
              handleUndo={handleUndo}
              handleClear={handleClear}
            />

            <ChartAreaSection
              children={children}
              drawTool={drawTool}
              drawColor={drawColor}
              drawLW={drawLW}
              drawVisible={drawVisible}
              drawingMode={drawingMode}
              shapes={shapes}
              setShapes={setShapes}
            />
          </div>

          <BottomPanelSection
            bottomH={bottomH}
            bottomOpen={bottomOpen}
            draggingBottom={draggingBottom}
            onBottomDragStart={onBottomDragStart}
            bottomPanel={bottomPanel}
          />
        </div>

        <RightPanelSection
          rightOpen={rightOpen}
          rightPanel={rightPanel}
          activeRightTab={activeRightTab}
          setActiveRightTab={setActiveRightTab}
          setRightOpen={setRightOpen}
        />
      </div>
    </div>
  );
}

function TopBarSection({
  topBar,
  rightOpen,
  setRightOpen,
}: {
  topBar?: React.ReactNode;
  rightOpen: boolean;
  setRightOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div
      style={{
        height: TOP_BAR_H,
        minHeight: TOP_BAR_H,
        display: "flex",
        alignItems: "center",
        borderBottom: `1px solid ${theme.dark.borderSoft}`,
        background: "rgba(14,17,23,0.86)",
        zIndex: 50,
        paddingLeft: LEFT_BAR_W,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {topBar}

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
          background: rightOpen ? selectedBlurBg : "transparent",
          border: `1px solid ${
            rightOpen ? selectedBlurBorder : theme.dark.borderSoft
          }`,
          borderRadius: 0,
          cursor: "pointer",
          color: rightOpen ? theme.dark.text : theme.dark.muted2,
          flexShrink: 0,
          backdropFilter: rightOpen ? "blur(12px)" : undefined,
          WebkitBackdropFilter: rightOpen ? "blur(12px)" : undefined,
          transition:
            "background 0.16s ease, color 0.16s ease, border-color 0.16s ease",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect
            x="1"
            y="1"
            width="12"
            height="12"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <line
            x1="9"
            y1="1"
            x2="9"
            y2="13"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </button>
    </div>
  );
}

function LeftBarSection({
  leftBar,
  drawingMode,
  setDrawingMode,
  drawTool,
  setDrawTool,
  drawColor,
  setDrawColor,
  drawLW,
  setDrawLW,
  drawVisible,
  setDrawVisible,
  handleUndo,
  handleClear,
}: {
  leftBar?: React.ReactNode;
  drawingMode: boolean;
  setDrawingMode: React.Dispatch<React.SetStateAction<boolean>>;
  drawTool: DrawTool;
  setDrawTool: React.Dispatch<React.SetStateAction<DrawTool>>;
  drawColor: string;
  setDrawColor: React.Dispatch<React.SetStateAction<string>>;
  drawLW: number;
  setDrawLW: React.Dispatch<React.SetStateAction<number>>;
  drawVisible: boolean;
  setDrawVisible: React.Dispatch<React.SetStateAction<boolean>>;
  handleUndo: () => void;
  handleClear: () => void;
}) {
  return (
    <div
      style={{
        ...surfacePanelStyle,
        width: LEFT_BAR_W,
        minWidth: LEFT_BAR_W,
        borderRight: `1px solid ${theme.dark.borderSoft}`,
        borderTop: "none",
        borderBottom: "none",
        borderLeft: "none",
        background: "rgba(14,17,23,0.86)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 8,
        paddingBottom: 8,
        gap: 2,
        zIndex: 40,
        overflowY: "auto",
      }}
    >
      {leftBar}

      {DRAW_TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => {
            setDrawTool(t.id);
            setDrawingMode(t.id !== "select");
          }}
          style={toolButtonStyle({ active: drawTool === t.id })}
        >
          {t.icon}
        </button>
      ))}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 32,
          borderRadius: 0,
          border: `1px solid ${theme.dark.borderSoft}`,
          overflow: "hidden",
          flexShrink: 0,
          marginBottom: 4,
          marginTop: 4,
          background: idleBg,
        }}
      >
        <button
          title="Chart mode — pan & zoom"
          onClick={() => setDrawingMode(false)}
          style={{
            height: 26,
            border: "none",
            background: !drawingMode ? selectedBlurBg : "transparent",
            color: !drawingMode ? theme.dark.text : theme.dark.muted2,
            cursor: "pointer",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: !drawingMode ? "blur(12px)" : undefined,
            WebkitBackdropFilter: !drawingMode ? "blur(12px)" : undefined,
          }}
        >
          ↕
        </button>

        <button
          title="Draw mode — annotate chart"
          onClick={() => setDrawingMode(true)}
          style={{
            height: 26,
            border: "none",
            borderTop: `1px solid ${theme.dark.borderSoft}`,
            background: drawingMode ? selectedBlurBg : "transparent",
            color: drawingMode ? theme.dark.text : theme.dark.muted2,
            cursor: "pointer",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: drawingMode ? "blur(12px)" : undefined,
            WebkitBackdropFilter: drawingMode ? "blur(12px)" : undefined,
          }}
        >
          ✏
        </button>
      </div>

      <div style={dividerStyle} />

      <Row label="">
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              position: "relative",
              width: 36,
              height: 20,
              overflow: "hidden",
              border: `1px solid ${theme.dark.borderSoft}`,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: drawColor,
              }}
            />
            <ColorPicker value={drawColor} onChange={(v) => setDrawColor(v)} />
          </div>
        </div>
      </Row>

      <select
        value={drawLW}
        onChange={(e) => setDrawLW(Number(e.target.value))}
        title="Line width"
        style={{
          width: 34,
          background: theme.dark.bg,
          color: theme.dark.muted2,
          border: `1px solid ${theme.dark.borderSoft}`,
          borderRadius: 0,
          fontSize: 10,
          padding: "1px 0",
          flexShrink: 0,
          outline: "none",
        }}
      >
        {[1, 2, 3, 4].map((n) => (
          <option key={n} value={n}>
            {n}px
          </option>
        ))}
      </select>

      <div style={dividerStyle} />

      <button title="Undo" onClick={handleUndo} style={toolButtonStyle({})}>
        ↩
      </button>

      <button
        title="Clear all"
        onClick={handleClear}
        style={toolButtonStyle({ danger: true })}
      >
        🗑
      </button>

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

function ChartAreaSection({
  children,
  drawTool,
  drawColor,
  drawLW,
  drawVisible,
  drawingMode,
  shapes,
  setShapes,
}: {
  children: TradeLayoutProps["children"];
  drawTool: DrawTool;
  drawColor: string;
  drawLW: number;
  drawVisible: boolean;
  drawingMode: boolean;
  shapes: Shape[];
  setShapes: React.Dispatch<React.SetStateAction<Shape[]>>;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        position: "relative",
        background:
          "linear-gradient(180deg, rgba(14,17,23,0.96), rgba(19,24,33,0.96))",
      }}
    >
      {children({ width: 0, height: 0 })}

      <DrawingCanvas
        tool={drawTool}
        color={drawColor}
        lineWidth={drawLW}
        visible={drawVisible}
        drawingMode={drawingMode}
        shapes={shapes}
        onShapesChange={setShapes}
      />
    </div>
  );
}

function BottomPanelSection({
  bottomH,
  bottomOpen,
  draggingBottom,
  onBottomDragStart,
  bottomPanel,
}: {
  bottomH: number;
  bottomOpen: boolean;
  draggingBottom: React.MutableRefObject<boolean>;
  onBottomDragStart: (e: React.MouseEvent) => void;
  bottomPanel?: React.ReactNode;
}) {
  return (
    <div
      style={{
        ...surfacePanelStyle,
        height: bottomH,
        minHeight: bottomH,
        borderTop: `1px solid ${theme.dark.borderSoft}`,
        borderRight: "none",
        borderBottom: "none",
        borderLeft: "none",
        background: "rgba(14,17,23,0.92)",
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
        transition: draggingBottom.current ? "none" : "height 120ms ease",
      }}
    >
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
            borderRadius: 0,
            background: selectedBlurBg,
            border: `1px solid ${selectedBlurBorder}`,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        />
      </div>

      {bottomOpen && (
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {bottomPanel ?? <BottomPanelPlaceholder />}
        </div>
      )}
    </div>
  );
}

function RightPanelSection({
  rightOpen,
  rightPanel,
  activeRightTab,
  setActiveRightTab,
  setRightOpen,
}: {
  rightOpen: boolean;
  rightPanel?: React.ReactNode;
  activeRightTab: RightTab;
  setActiveRightTab: React.Dispatch<React.SetStateAction<RightTab>>;
  setRightOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [hoveredTab, setHoveredTab] = useState<RightTab | null>(null);

  return (
    <div
      style={{
        ...surfacePanelStyle,
        width: rightOpen ? RIGHT_PANEL_W : 0,
        minWidth: rightOpen ? RIGHT_PANEL_W : 0,
        overflow: "hidden",
        borderLeft: `1px solid ${theme.dark.borderSoft}`,
        borderTop: "none",
        borderRight: "none",
        borderBottom: "none",
        background: "rgba(14,17,23,0.92)",
        transition: "width 180ms ease, min-width 180ms ease",
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          padding: 12,
          borderBottom: `1px solid ${theme.dark.borderSoft}`,
          flexShrink: 0,
        }}
      >
        {RIGHT_TABS.map((tab) => {
          const active = activeRightTab === tab.id;
          const hovered = hoveredTab === tab.id && !active;

          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveRightTab(tab.id);
                setRightOpen(true);
              }}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                position: "relative",
                height: 56,
                borderRadius: 0,
                border: `1px solid ${
                  active
                    ? selectedBlurBorder
                    : hovered
                    ? theme.dark.border
                    : theme.dark.borderSoft
                }`,
                background: active ? selectedBlurBg : hovered ? hoverBg : idleBg,
                color: active
                  ? theme.dark.text
                  : hovered
                  ? theme.dark.muted
                  : theme.dark.muted2,
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "inherit",
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                backdropFilter: active ? "blur(12px)" : undefined,
                WebkitBackdropFilter: active ? "blur(12px)" : undefined,
                transition:
                  "background 0.16s ease, color 0.16s ease, border-color 0.16s ease",
              }}
            >
              {active && <div style={cornerStyle()} />}
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {rightPanel ?? <RightPanelPlaceholder activeTab={activeRightTab} />}
      </div>
    </div>
  );
}

function RightPanelPlaceholder({ activeTab }: { activeTab: RightTab }) {
  return (
    <div
      style={{
        position: "relative",
        margin: 12,
        padding: 16,
        color: theme.dark.muted2,
        fontSize: 12,
        border: `1px solid ${theme.dark.borderSoft}`,
        background: idleBg,
      }}
    >
      <div style={cornerStyle()} />
      {activeTab === "add-chart" && "Chart layout controls"}
      {activeTab === "strategy" && "Strategy marking tools"}
      {activeTab === "backtest" && "Backtest controls"}
      {activeTab === "indicators" && "Indicator library"}
      {activeTab === "watchlist" && "Watchlist"}
      {activeTab === "tools" && "Custom tools"}
      {activeTab === "alerts" && "Alerts"}
      {activeTab === "positions" && "Positions"}
    </div>
  );
}

function BottomPanelPlaceholder() {
  return (
    <div
      style={{
        position: "relative",
        color: theme.dark.muted2,
        fontSize: 12,
        fontFamily: "inherit",
        border: `1px solid ${theme.dark.borderSoft}`,
        background: idleBg,
        padding: 14,
      }}
    >
      <div style={cornerStyle()} />
      Panel content goes here
    </div>
  );
}