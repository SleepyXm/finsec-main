"use client";

import { ChartProvider, useChartContext } from "../chartcontext";
import TradeLayout from "../TradeLayout";
import { CandleStickChart } from "@/app/components/chartrender/charts/CandleStickChart";
import { Linechart } from "@/app/components/chartrender/charts/Linechart";
import TradingPanel from "@/app/components/trading/panel";
import TradeButtons from "@/app/components/trading/tradebuttons";
import { TopBar } from "./TopBar";


function ChartPageInner() {
  const {
    shortname, tick, connected, error, chartData,
    isCandle, isCreatingStrategy, handleAnnotation,
    positions, livePnLMap, accountUnrealisedPnL,
    placeTrade, closeTrade, handlePositionClosed,
  } = useChartContext();

  const tradeUI = (
    <>
      {!connected && <p className="text-xs text-yellow-500 mb-1">Connecting to feed...</p>}
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
      <TradeButtons data={tick} onTrade={(action) => placeTrade(action, tick, shortname)} />
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
          onClose={handlePositionClosed}
        />
      }
    >
      {() =>
        chartData.length > 0 ? (
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
            />
          ) : (
            <Linechart data={chartData} renderTradeUI={tradeUI} trades={[]} />
          )
        ) : (
          <p style={{ color: "#6b7280", padding: 16 }}>Loading chart...</p>
        )
      }
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