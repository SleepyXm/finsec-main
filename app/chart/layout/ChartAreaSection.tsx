"use client";

import { useState } from "react";
import type React from "react";
import DrawingCanvas, { Shape } from "@/app/chart/chartrender/overlays/DrawingCanvas";
import { ChartProvider, useChartContext } from "../chartcontext";
import { ChartRenderer } from "@/app/chart/chartrender/ChartRenderer";
import { defaultChartTheme } from "@/app/chart/chartrender/themes/themes";
import type { ChartTheme } from "@/app/chart/chartrender/themes/themes";
import type { AppliedIndicator } from "@/app/indicators/language/types";
import type { Interval } from "@/app/types/charts";
import TradeButtons from "@/app/components/trading/tradebuttons";
import { ChartQuoteStrip } from "./TopBar";
import type { DrawTool } from "./LeftBarSection";

// ── extra chart (one per additional symbol) ──────────────────────────────────

export interface ExtraChartSettings {
  theme: ChartTheme;
  interval: Interval;
  isCandle: boolean;
  appliedIndicators: AppliedIndicator[];
}

function ExtraChartInner({
  onRemove,
  settings,
}: {
  onRemove: () => void;
  settings: ExtraChartSettings;
}) {
  const {
    shortname,
    tick,
    connected,
    error,
    chartData,
    isCandle,
    positions,
    livePnLMap,
    placeTrade,
    closeTrade,
    updatePosition,
    loadPreviousPage,
  } = useChartContext();
  const [quantity, setQuantity] = useState(1);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderLeft: "1px solid #1e2130" }}>
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
          renderTradeUI={
            <>
              {!connected && (
                <p className="mb-1 text-xs text-yellow-500">Connecting to feed…</p>
              )}
              {error && (
                <p className="mb-2 text-sm text-red-500">{error}</p>
              )}
              <TradeButtons
                data={tick}
                onTrade={(action) => {
                  if (tick) placeTrade(action, tick, shortname, quantity);
                }}
                quantity={quantity}
                onQuantityChange={setQuantity}
              />
            </>
          }
          positions={positions}
          livePnLMap={livePnLMap}
          updatePosition={updatePosition}
          onClosePosition={(id) => closeTrade(id, tick?.close ?? 0)}
          onScrollLeft={loadPreviousPage}
          appliedIndicators={settings.appliedIndicators}
          theme={settings.theme}
        />
      ) : (
        <p style={{ color: "#6b7280", padding: 16, fontSize: 12 }}>Loading…</p>
      )}

      <div style={{ position: "absolute", top: 8, left: 10, zIndex: 12 }}>
        <ChartQuoteStrip />
      </div>
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
  extraChartSettings?: ExtraChartSettings;
}

export function ChartAreaSection({
  primaryChart, extraSymbols, onRemoveChart,
  drawTool, drawColor, drawLW, drawVisible, drawingMode, shapes, setShapes,
  extraChartSettings,
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
          <ChartProvider
            symbol={symbol}
            intervalOverride={extraChartSettings?.interval}
            isCandleOverride={extraChartSettings?.isCandle}
          >
            <ExtraChartInner
              onRemove={() => onRemoveChart(i)}
              settings={extraChartSettings ?? {
                theme: defaultChartTheme,
                interval: "5m",
                isCandle: true,
                appliedIndicators: [],
              }}
            />
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
