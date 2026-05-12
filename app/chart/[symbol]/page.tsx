"use client";

import { Interval } from "../../types/charts";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useChartData } from "../chartdata";
import { useStockSocket } from "@/app/hooks/useStockSocket";
import { usePositions } from "@/app/hooks/usePositions";
import { useTrades } from "../../hooks/useTrades";
import TradeButtons from "@/app/components/trading/tradebuttons";
import TradingPanel from "@/app/components/trading/panel";
import { useRouter } from "next/navigation";
import { CandleStickChart } from "@/app/components/chartrender/charts/CandleStickChart";
import { Linechart } from "@/app/components/chartrender/charts/Linechart";

const intervals: Interval[] = ["1m", "5m", "15m", "1h", "1d", "1wk", "1mo"];

export default function ChartPage() {
  const params = useParams();
  const symbolParam = typeof params.symbol === "string" ? decodeURIComponent(params.symbol) : "";
  const shortname = symbolParam.toUpperCase();
  const [interval, setInterval] = useState<Interval>("5m");
  const [isCandle, setIsCandle] = useState(true);
  const [activeTrades, setActiveTrades] = useState<any[]>([]);
  const [accountUnrealisedPnL, setAccountUnrealisedPnL] = useState<number>(0);
  const [isCreatingStrategy, setIsCreatingStrategy] = useState(false);
  const router = useRouter();

  // Lifted up from TradeButtonRow
  const { positions, setPositions, handlePositionClosed } = usePositions(shortname);
  const { placeTrade, closeTrade, error } = useTrades(positions, setPositions);
  const { tick, historicalData, connected, livePnLMap } = useStockSocket(shortname, interval, positions, handlePositionClosed, setAccountUnrealisedPnL);

  const { data, updateLastCandle } = useChartData(shortname, interval, historicalData);

  const [annotations, setAnnotations] = useState<any[]>([]);

  const handleAnnotation = (annotation: any) => {
    setAnnotations(prev => [...prev, annotation]);
    setIsCreatingStrategy(false); // optional — exit strategy mode after labelling
    console.log('annotation saved:', annotation); // temp until you wire up persistence
  };

  // Pipe tick into chart
  useEffect(() => {
    if (!tick) return;
    updateLastCandle({
      time: tick.time,
      open: tick.open,
      high: tick.high,
      low: tick.low,
      close: tick.close,
    });
  }, [tick]);

  const chartData = isCandle ? data : data?.map((item: any) => ({ ...item, value: item.close }));

  const tradeUI = (
  <>
    {!connected && <p className="text-xs text-yellow-500 mb-1">Connecting to feed...</p>}
    {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
    <TradeButtons data={tick} onTrade={(action) => placeTrade(action, tick, shortname)} />
  </>
);

  return (
    <div className="p-4 bg-zinc-950">
      <div className="flex justify-between items-center my-4">
        <div className="flex gap-2">
          {intervals.map((int) => (
            <button
              key={int}
              onClick={() => setInterval(int)}
              className={`px-3 py-1 rounded ${interval === int ? "bg-blue-600 text-white" : "bg-gray-600"}`}
            >
              {int}
            </button>
          ))}
        </div>
        
        <button
          onClick={() => setIsCreatingStrategy(prev => !prev)}
          className={`px-3 py-1 rounded ${isCreatingStrategy ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"} text-sm`}
        >
          {isCreatingStrategy ? "Cancel" : "Create Strategy"}
        </button>

        <button
          onClick={() => router.push(`/backtest?ticker=${shortname}&interval=${interval}`)}
          className="px-3 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 text-sm"
        >
            Backtest
        </button>
        <div className="flex gap-2">
          <button onClick={() => setIsCandle(true)} className={`px-3 py-1 rounded ${isCandle ? "bg-blue-600 text-white" : "bg-gray-600"}`}>
            Candlestick
          </button>
          <button onClick={() => setIsCandle(false)} className={`px-3 py-1 rounded ${!isCandle ? "bg-blue-600 text-white" : "bg-gray-600"}`}>
            Line
          </button>
        </div>
      </div>
      <h2 className="text-xl font-bold mb-2">{shortname} Chart</h2>
      {chartData && chartData.length > 0 ? (
        isCandle ? (
          // Candlestick chart implementing output from 
          <CandleStickChart
            data={chartData}
            trades={activeTrades}
            renderTradeUI={tradeUI}
            positions={positions}
            livePnLMap={livePnLMap}
            onClosePosition={(positionId) => closeTrade(positionId, tick?.close ?? 0)}
            isCreatingStrategy={isCreatingStrategy}
            onAnnotation={handleAnnotation}
          />
        ) : (
          <Linechart data={chartData} renderTradeUI={tradeUI} trades={activeTrades} />
        )
      ) : (
        <p>Loading {isCandle ? "candlestick" : "line"} chart data...</p>
      )}
      <TradingPanel accountUnrealisedPnL={accountUnrealisedPnL} positions={positions} livePnLMap={livePnLMap} onClose={handlePositionClosed} />
    </div>
  );
}