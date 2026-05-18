"use client";

import { useState, useEffect } from "react";
import { ChartProvider, useChartContext } from "../chartcontext";
import TradeLayout from "../TradeLayout";
import { CandleStickChart } from "@/app/chart/chartrender/charts/CandleStickChart";
import { Linechart } from "@/app/chart/chartrender/charts/Linechart";
import TradingPanel from "@/app/components/trading/panel";
import TradeButtons from "@/app/components/trading/tradebuttons";
import { TopBar } from "./TopBar";
import { ChartTheme } from "@/app/chart/chartrender/themes/themes";
import { ChartThemeModal } from "@/app/chart/chartrender/overlays/ThemeSettings";
import { defaultChartTheme } from "@/app/chart/chartrender/themes/themes";
import { getPreferences, savePreferences } from "@/app/handlers/profile";


function ChartPageInner() {
  const {
    shortname, tick, connected, error, chartData,
    isCandle, isCreatingStrategy, handleAnnotation,
    positions, livePnLMap, accountUnrealisedPnL,
    placeTrade, closeTrade, handlePositionClosed,
  } = useChartContext();

  const [quantity, setQuantity] = useState(1);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [themeOverrides, setThemeOverrides] = useState<Partial<ChartTheme>>({});

  useEffect(() => {
    getPreferences().then(data => {
      if (data?.color_scheme?.colours) {
        setThemeOverrides(data.color_scheme.colours);
      }
    });
  }, []);

  const activeTheme = { ...defaultChartTheme, ...themeOverrides };
  console.log("activeTheme bullCandle:", activeTheme.bullCandle);

  // save on modal save
  const handleSave = (overrides: Partial<ChartTheme>) => {
    const next = { ...themeOverrides, ...overrides };
    setThemeOverrides(next);
    savePreferences(isCandle ? "candlestick" : "line", next);
  };
  const tradeUI = (
    <>
      {!connected && <p className="text-xs text-yellow-500 mb-1">Connecting to feed...</p>}
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
      <TradeButtons data={tick} onTrade={(action) => placeTrade(action, tick, shortname, quantity)} quantity={quantity} onQuantityChange={setQuantity} />
    </>
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
    >
      {() => (
        <div className="relative w-full h-full" onContextMenu={e => {console.log('context menu fired');  e.preventDefault(); setThemeModalOpen(true); }}>
          {chartData.length > 0 ? (
            isCandle ? (
              <CandleStickChart
                data={chartData}
                trades={[]}
                renderTradeUI={tradeUI}
                positions={positions}
                livePnLMap={livePnLMap}
                onClosePosition={(id) => closeTrade(id, tick?.close ?? 0)}
                isCreatingStrategy={isCreatingStrategy}
                onAnnotation={handleAnnotation}
                theme={activeTheme}
              />
            ) : (
              <Linechart data={chartData} renderTradeUI={tradeUI} trades={[]} theme={activeTheme} />
            )
          ) : (
            <p style={{ color: "#6b7280", padding: 16 }}>Loading chart...</p>
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
      )}
    </TradeLayout>
  );
}

export default function ChartPage() {
  return (
    <ChartProvider>
      <ChartPageInner />
    </ChartProvider>
  );
}