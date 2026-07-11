"use client";

import type React from "react";
import DrawingCanvas, { Shape } from "@/app/chart/chartrender/overlays/DrawingCanvas";
import { ChartProvider, useChartContext } from "../chartcontext";
import { TopBar } from "./TopBar";
import { ChartRenderer } from "@/app/chart/chartrender/ChartRenderer";
import { defaultChartTheme } from "@/app/chart/chartrender/themes/themes";
import type { DrawTool } from "./LeftBarSection";

// ── extra chart (one per additional symbol) ──────────────────────────────────

function ExtraChartInner({ onRemove }: { onRemove: () => void }) {
  const { chartData, isCandle, positions, livePnLMap, updatePosition, appliedIndicators } = useChartContext();

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderLeft: "1px solid #1e2130" }}>
      <div style={{ height: 40, minHeight: 40, borderBottom: "1px solid #1e2130" }}>
        <TopBar />
      </div>

      <button
        onClick={onRemove}
        title="Remove chart"
        style={{
          position: "absolute", top: 8, right: 8, zIndex: 10,
          fontSize: 11, padding: "2px 8px",
          background: "rgba(0,0,0,0.35)", border: "none", borderRadius: 3,
          color: "rgba(255,255,255,0.4)", cursor: "pointer",
        }}
      >
        ✕
      </button>

      {chartData.length > 0 ? (
        <ChartRenderer
          type={isCandle ? "candlestick" : "line"}
          data={chartData}
          trades={[]}
          positions={positions}
          livePnLMap={livePnLMap}
          updatePosition={updatePosition}
          appliedIndicators={appliedIndicators}
          theme={defaultChartTheme}
        />
      ) : (
        <p style={{ color: "#6b7280", padding: 16, fontSize: 12 }}>Loading…</p>
      )}
    </div>
  );
}

// ── chart area (primary + extras) ────────────────────────────────────────────

interface ChartAreaSectionProps {
  primaryChart:   React.ReactNode;
  extraSymbols:   string[];
  onRemoveChart:  (index: number) => void;
  drawTool:       DrawTool;
  drawColor:      string;
  drawLW:         number;
  drawVisible:    boolean;
  drawingMode:    boolean;
  shapes:         Shape[];
  setShapes:      React.Dispatch<React.SetStateAction<Shape[]>>;
}

export function ChartAreaSection({
  primaryChart, extraSymbols, onRemoveChart,
  drawTool, drawColor, drawLW, drawVisible, drawingMode, shapes, setShapes,
}: ChartAreaSectionProps) {
  const total = 1 + extraSymbols.length;
  const pct   = `${100 / total}%`;

  return (
    <div style={{
      flex: 1, minWidth: 0, overflow: "hidden",
      position: "relative",
      display: "flex",
      background: "linear-gradient(180deg, rgba(14,17,23,0.96), rgba(19,24,33,0.96))",
    }}>
      {/* primary */}
      <div style={{ width: pct, height: "100%", flexShrink: 0 }}>
        {primaryChart}
      </div>

      {/* extras */}
      {extraSymbols.map((symbol, i) => (
        <div key={`${symbol}-${i}`} style={{ width: pct, height: "100%", flexShrink: 0 }}>
          <ChartProvider symbol={symbol}>
            <ExtraChartInner onRemove={() => onRemoveChart(i)} />
          </ChartProvider>
        </div>
      ))}

      {/* drawing overlay spans the whole area */}
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
