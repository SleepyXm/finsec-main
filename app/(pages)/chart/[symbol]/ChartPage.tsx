"use client";

import { useState, useEffect } from "react";
import { ChartProvider, useChartContext } from "../chartcontext";
import TradeLayout from "@/app/(pages)/chart/layout/TradeLayout";
import TradingPanel from "@/app/components/trading/panel";
import TradeButtons from "@/app/components/trading/tradebuttons";
import { ChartQuoteStrip, TopBar } from "@/app/(pages)/chart/layout/TopBar";
import { ChartRenderer } from "@/app/(pages)/chart/chartrender/ChartRenderer";
import { ChartThemeModal } from "@/app/(pages)/chart/chartrender/overlays/ThemeSettings";
import { defaultChartTheme } from "@/app/(pages)/chart/chartrender/themes/themes";
import { ChartTheme } from "@/app/(pages)/chart/chartrender/themes/themes";
import { getPreferences, savePreferences } from "@/app/components/handlers/profile";
import { BacktestProvider, useBacktestContext } from "@/app/features/backtest/components/BacktestContext";
import {
  StrategyEngineProvider,
  useStrategyEngine,
} from "@/app/features/StrategyEngine/StrategyEngineProvider";
import { EmptyState, LoadingState } from "@/app/UI";
import { loadMarketplaceStrategy } from "@/app/components/handlers/marketplace";

function ChartLoadState({ connected }: { connected: boolean }) {
  return (
    <LoadingState
      message={connected ? "Loading chart…" : "Connecting to chart service…"}
      className="!h-full !bg-transparent"
    />
  );
}

function ChartPageInner() {
  const {
    shortname, tick, connected, error,
    chartData, interval, isCandle, setIsCandle,
    positions, livePnLMap,
    accountUnrealisedPnL, placeTrade, closeTrade,
    updatePosition, loadPreviousPage, appliedIndicators, tradeReady, tradePending,
  } = useChartContext();
  const {
    chartController, forwardPass, setActiveStrategy,
  } = useStrategyEngine();
  const backtest = useBacktestContext();

  const [quantity,       setQuantity]       = useState(1);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [themeOverrides, setThemeOverrides] = useState<Partial<ChartTheme>>({});

  useEffect(() => {
    const strategy = loadMarketplaceStrategy();
    if (strategy) setActiveStrategy(strategy);
  }, [setActiveStrategy]);

  useEffect(() => {
    getPreferences().then((data) => {
      if (data?.color_scheme?.colours) setThemeOverrides(data.color_scheme.colours);
      if (data?.color_scheme?.chart) {
        setIsCandle(data.color_scheme.chart === "candlestick");
      }
    });
  }, [setIsCandle]);

  const activeTheme = { ...defaultChartTheme, ...themeOverrides };
  const isBacktesting = backtest.session !== null;
  const activeData = isBacktesting
    ? isCandle
      ? backtest.visibleCandles
      : backtest.visibleCandles.map((candle) => ({ ...candle, value: candle.close }))
    : chartData;
  const activePositions = isBacktesting ? backtest.openPositions : positions;
  const activePnLMap = isBacktesting ? backtest.livePnLMap : livePnLMap;
  const activePrice = isBacktesting ? backtest.currentCandle : tick;
  const activeError = isBacktesting ? backtest.error : error;

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
              {activeError && (
                <p className="text-red-500 text-sm mb-2">
                  {activeError}
                </p>
              )}
              <TradeButtons
                data={activePrice}
                disabled={!isBacktesting && (!tradeReady || tradePending)}
                onTrade={(action, selectedQuantity, order) => {
                  if (isBacktesting && backtest.session && backtest.currentCandle) {
                    backtest.placeTrade(
                      action,
                      backtest.currentCandle,
                      backtest.session.ticker,
                      selectedQuantity,
                    );
                    return;
                  }
                  if (tick) {
                    placeTrade(action, tick, shortname, selectedQuantity, order);
                  }
                }}
                quantity={isBacktesting ? backtest.quantity : quantity}
                onQuantityChange={isBacktesting ? backtest.setQuantity : setQuantity}
                allowLimitOrders={!isBacktesting}
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
              );
              return;
            }
            closeTrade(id, tick?.close ?? 0);
          }}
          strategy={{
            ...chartController,
            isCreatingStrategy:
              !isBacktesting &&
              chartController.isCreatingStrategy,
          }}
          onScrollLeft={isBacktesting ? undefined : loadPreviousPage}
          appliedIndicators={appliedIndicators}
          forwardPass={
            isBacktesting
              ? backtest.forwardPass
              : forwardPass
          }
          theme={activeTheme}
        />
      ) : isBacktesting ? (
        <EmptyState
          icon={<span aria-hidden="true" className="text-xl">▷</span>}
          message="Press play to start replay."
          className="!h-full !bg-transparent"
        />
      ) : activeError ? (
        <EmptyState
          icon={<span aria-hidden="true" className="text-xl">!</span>}
          message={activeError}
          className="!h-full !bg-transparent text-red-300/70"
        />
      ) : (
        <ChartLoadState connected={connected} />
      )}

      <div style={{ position: "absolute", top: 8, left: 10, zIndex: 12 }}>
        <ChartQuoteStrip />
      </div>

      {appliedIndicators.some((indicator) => indicator.enabled) && (
        <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 12, color: "#94a3b8", fontSize: 10, whiteSpace: "nowrap" }}>
          {appliedIndicators.filter((indicator) => indicator.enabled).map((indicator) => indicator.compiled.metadata.title).join(" · ")}
        </div>
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
      chartTheme={activeTheme}
      extraChartSettings={{
        theme: activeTheme,
        interval,
        isCandle,
        appliedIndicators,
      }}
    />
  );
}

export default function ChartPage() {
  return (
    <ChartProvider>
      <StrategyEngineProvider>
        <BacktestProvider>
          <ChartPageInner />
        </BacktestProvider>
      </StrategyEngineProvider>
    </ChartProvider>
  );
}
