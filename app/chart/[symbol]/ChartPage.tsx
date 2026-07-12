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
import {
  BacktestProvider,
  useBacktestContext,
} from "@/app/backtest/components/BacktestContext";

function ChartPageInner() {
  const {
    shortname, tick, connected, error,
    chartData, isCandle, isCreatingStrategy,
    handleAnnotation, positions, livePnLMap,
    accountUnrealisedPnL, placeTrade, closeTrade,
    updatePosition, loadPreviousPage, appliedIndicators,
  } = useChartContext();
  const backtest = useBacktestContext();

  const [quantity,       setQuantity]       = useState(1);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [themeOverrides, setThemeOverrides] = useState<Partial<ChartTheme>>({});

  useEffect(() => {
    getPreferences().then((data) => {
      if (data?.color_scheme?.colours) setThemeOverrides(data.color_scheme.colours);
    });
  }, []);

  const activeTheme = { ...defaultChartTheme, ...themeOverrides };
  const isBacktesting = backtest.session !== null;
  const activeData = isBacktesting
    ? isCandle
      ? backtest.visibleCandles
      : backtest.visibleCandles.map((candle) => ({ ...candle, value: candle.close }))
    : chartData;
  const activePositions = isBacktesting ? backtest.positions : positions;
  const activePnLMap = isBacktesting ? backtest.livePnLMap : livePnLMap;
  const activePrice = isBacktesting ? backtest.currentCandle : tick;

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
      {activeData.length > 0 ? (
        <ChartRenderer
          type={isCandle ? "candlestick" : "line"}
          data={activeData}
          trades={[]}
          renderTradeUI={
            <>
              {!isBacktesting && !connected && (
                <p className="text-xs text-yellow-500 mb-1">Connecting to feed…</p>
              )}
              {(isBacktesting ? backtest.error : error) && (
                <p className="text-red-500 text-sm mb-2">
                  {isBacktesting ? backtest.error : error}
                </p>
              )}
              <TradeButtons
                data={activePrice}
                onTrade={(action) => {
                  if (isBacktesting && backtest.session && backtest.currentCandle) {
                    backtest.placeTrade(
                      action,
                      backtest.currentCandle,
                      backtest.session.ticker,
                      backtest.quantity,
                      backtest.session.session_id,
                    );
                    return;
                  }
                  placeTrade(action, tick, shortname, quantity);
                }}
                quantity={isBacktesting ? backtest.quantity : quantity}
                onQuantityChange={isBacktesting ? backtest.setQuantity : setQuantity}
              />
            </>
          }
          positions={activePositions}
          livePnLMap={activePnLMap}
          updatePosition={isBacktesting ? undefined : updatePosition}
          onClosePosition={(id) => {
            if (isBacktesting && backtest.session) {
              backtest.closeTrade(
                id,
                backtest.currentCandle?.close ?? 0,
                backtest.session.session_id,
              );
              return;
            }
            closeTrade(id, tick?.close ?? 0);
          }}
          isCreatingStrategy={!isBacktesting && isCreatingStrategy}
          onAnnotation={handleAnnotation}
          onScrollLeft={isBacktesting ? undefined : loadPreviousPage}
          appliedIndicators={appliedIndicators}
          theme={activeTheme}
        />
      ) : (
        <p style={{ color: "#6b7280", padding: 16 }}>
          {isBacktesting ? "Press play to start replay…" : "Loading chart…"}
        </p>
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
      <BacktestProvider>
        <ChartPageInner />
      </BacktestProvider>
    </ChartProvider>
  );
}
