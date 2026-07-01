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
import { AssetSearchBar, AssetListItem } from "@/app/assetsearch/assetsearchcomponents";
import { useAssetSearch } from "@/app/hooks/utility";
import { IndicatorPanel } from "@/app/indicators/core/editor/IndicatorPanel";

// --- extra chart pane (read-only, no trading UI) ----------------------------

function ExtraChartInner({ onRemove }: { onRemove: () => void }) {
  const { chartData, isCandle } = useChartContext();

  return (
    <div className="relative w-full h-full border-l border-white/10">
      <div style={{ height: 40, minHeight: 40, borderBottom: "1px solid #1e2130" }}>
        <TopBar />
      </div>
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 z-10 text-xs px-2 py-1 bg-black/30 rounded text-white/40 hover:text-white"
      >
        ✕
      </button>
      {chartData.length > 0 ? (
        <CandleStickChart
          data={chartData}
          trades={[]}
          positions={[]}
          livePnLMap={{}}
          onClosePosition={() => {}}
          isCreatingStrategy={false}
          onAnnotation={() => {}}
          theme={defaultChartTheme}
        />
      ) : (
        <p style={{ color: "#6b7280", padding: 16 }}>Loading...</p>
      )}
    </div>
  );
}

// --- primary chart (unchanged internals) ------------------------------------

function ChartPageInner({ extraSymbols, onAddSymbol, onRemoveSymbol }: {
  extraSymbols: string[];
  onAddSymbol: (s: string) => void;
  onRemoveSymbol: (i: number) => void;
}) {
  const {
    shortname,
    tick,
    connected,
    error,
    chartData,
    isCandle,
    isCreatingStrategy,
    isIndicatorPanelOpen,
    handleAnnotation,
    positions,
    livePnLMap,
    accountUnrealisedPnL,
    placeTrade,
    closeTrade,
    loadingMore,
    loadPreviousPage,
  } = useChartContext();

  const [quantity, setQuantity] = useState(1);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [themeOverrides, setThemeOverrides] = useState<Partial<ChartTheme>>({});
  const [showSearch, setShowSearch] = useState(false);
  const { assets, loading, search } = useAssetSearch();

  useEffect(() => {
    getPreferences().then(data => {
      if (data?.color_scheme?.colours) setThemeOverrides(data.color_scheme.colours);
    });
  }, []);

  const activeTheme = { ...defaultChartTheme, ...themeOverrides };

  const handleSave = (overrides: Partial<ChartTheme>) => {
    const next = { ...themeOverrides, ...overrides };
    setThemeOverrides(next);
    savePreferences(isCandle ? "candlestick" : "line", next);
  };

  const tradeUI = (
    <>
      {!connected && <p className="text-xs text-yellow-500 mb-1">Connecting to feed...</p>}
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
      <TradeButtons
        data={tick}
        onTrade={(action) => placeTrade(action, tick, shortname, quantity)}
        quantity={quantity}
        onQuantityChange={setQuantity}
      />
    </>
  );

  const totalCharts = 1 + extraSymbols.length;

  return (
    <TradeLayout
      topBar={
        <div className="flex items-center gap-2 w-full">
          <TopBar />
          <button
            onClick={() => setShowSearch(v => !v)}
            className="ml-auto text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70"
          >
            {showSearch ? "Cancel" : "+ Add Chart"}
          </button>
          {showSearch && (
            <div className="relative w-[240px]">
              <AssetSearchBar onSearch={search} />
              {assets.length > 0 && (
                <ul className="absolute top-full mt-1 left-0 w-full bg-[#131722] border border-[#2a2e3a] rounded-xl shadow-xl overflow-hidden list-none p-0 m-0 z-50">
                  {assets.map(asset => (
                    <AssetListItem
                      key={asset.symbol}
                      asset={asset}
                      onSelect={() => { onAddSymbol(asset.symbol); setShowSearch(false); }}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      }
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
        <div className="flex w-full h-full">
          <div className="flex h-full min-w-0" style={{ flex: 1 }}>
            {/* primary */}
            <div style={{ width: `${100 / totalCharts}%` }} className="h-full">
              <div
                className="relative w-full h-full"
                onContextMenu={e => { e.preventDefault(); setThemeModalOpen(true); }}
              >
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
                      onScrollLeft={loadPreviousPage}
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
            </div>

            {/* extra charts — each gets its own ChartProvider + data pipeline */}
            {extraSymbols.map((symbol, i) => (
              <div key={symbol + i} style={{ width: `${100 / totalCharts}%` }} className="h-full">
                <ChartProvider symbol={symbol}>
                  <ExtraChartInner onRemove={() => onRemoveSymbol(i)} />
                </ChartProvider>
              </div>
            ))}
          </div>

          {isIndicatorPanelOpen && <IndicatorPanel />}
        </div>
      )}
    </TradeLayout>
  );
}

// --- root -------------------------------------------------------------------

export default function ChartPage() {
  const [extraSymbols, setExtraSymbols] = useState<string[]>([]);

  return (
    <ChartProvider>
      <ChartPageInner
        extraSymbols={extraSymbols}
        onAddSymbol={s => setExtraSymbols(prev => [...prev, s])}
        onRemoveSymbol={i => setExtraSymbols(prev => {
          const next = [...prev];
          next.splice(i, 1);
          return next;
        })}
      />
    </ChartProvider>
  );
}