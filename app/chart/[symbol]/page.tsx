"use client";

import { useState, useEffect } from "react";
import { ChartProvider, useChartContext } from "../chartcontext";
import TradeLayout from "@/app/chart/layout/TradeLayout";
import TradingPanel from "@/app/components/trading/panel";
import TradeButtons from "@/app/components/trading/tradebuttons";
import { TopBar } from "@/app/chart/layout/TopBar";
import { ChartRenderer } from "@/app/chart/chartrender/ChartRenderer";
import { ChartThemeModal } from "@/app/chart/chartrender/overlays/ThemeSettings";
import { defaultChartTheme } from "@/app/chart/chartrender/themes/themes";
import type { ChartTheme } from "@/app/chart/chartrender/themes/themes";
import { getPreferences, savePreferences } from "@/app/handlers/profile";

function ChartPageInner() {
  const {
    shortname, tick, connected, error,
    chartData, isCandle, isCreatingStrategy,
    handleAnnotation, positions, livePnLMap,
    accountUnrealisedPnL, placeTrade, closeTrade,
    updatePosition, loadPreviousPage, appliedIndicators,
  } = useChartContext();

  const [quantity,       setQuantity]       = useState(1);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [themeOverrides, setThemeOverrides] = useState<Partial<ChartTheme>>({});

  useEffect(() => {
    getPreferences().then((data) => {
      if (data?.color_scheme?.colours) setThemeOverrides(data.color_scheme.colours);
    });
  }, []);

  const activeTheme = { ...defaultChartTheme, ...themeOverrides };

  const handleSave = (overrides: Partial<ChartTheme>) => {
    const next = { ...themeOverrides, ...overrides };
    setThemeOverrides(next);
    savePreferences(isCandle ? "candlestick" : "line", next);
  };

  const primaryChart = (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
      onContextMenu={(e) => { e.preventDefault(); setThemeModalOpen(true); }}
    >
      {chartData.length > 0 ? (
        <ChartRenderer
          type={isCandle ? "candlestick" : "line"}
          data={chartData}
          trades={[]}
          renderTradeUI={
            <>
              {!connected && (
                <p className="text-xs text-yellow-500 mb-1">Connecting to feed…</p>
              )}
              {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
              <TradeButtons
                data={tick}
                onTrade={(action) => placeTrade(action, tick, shortname, quantity)}
                quantity={quantity}
                onQuantityChange={setQuantity}
              />
            </>
          }
          positions={positions}
          livePnLMap={livePnLMap}
          updatePosition={updatePosition}
          onClosePosition={(id) => closeTrade(id, tick?.close ?? 0)}
          isCreatingStrategy={isCreatingStrategy}
          onAnnotation={handleAnnotation}
          onScrollLeft={loadPreviousPage}
          appliedIndicators={appliedIndicators}
          theme={activeTheme}
        />
      ) : (
        <p style={{ color: "#6b7280", padding: 16 }}>Loading chart…</p>
      )}

      {themeModalOpen && (
        <ChartThemeModal
          isCandle={isCandle}
          theme={activeTheme}
          onSave={handleSave}
          onClose={() => setThemeModalOpen(false)}
        />
      )}
    </div>
  );

  return (
    <TradeLayout
      topBar={<TopBar />}
      bottomPanel={
        <TradingPanel
          accountUnrealisedPnL={accountUnrealisedPnL}
          positions={positions}
          livePnLMap={livePnLMap}
          onClose={(id) => closeTrade(id, tick?.close ?? 0)}
        />
      }
      primaryChart={primaryChart}
    />
  );
}

export default function ChartPage() {
  return (
    <ChartProvider>
      <ChartPageInner />
    </ChartProvider>
  );
}
