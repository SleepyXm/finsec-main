"use client";
import { CandleStickChart } from "../components/chartrender";
import { useState } from "react";
import BacktestForm from "./components/BacktestForm";
import BacktestControls from "./components/BacktestControls";
import BacktestStats from "./components/BacktestStats";
import TradeButtons from "../components/trading/tradebuttons";
import TradingPanel from "../components/trading/panel";
import { usePositions } from "../hooks/usePositions";
import { useTrades } from "../hooks/useTrades";
import { BacktestSession, BacktestCandle } from "../types/backend";
import OpenPositions from "../components/trading/positions";

export default function BacktestPage() {
  const [session, setSession] = useState<BacktestSession | null>(null);
  const [candles, setCandles] = useState<BacktestCandle[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [isCandle, setIsCandle] = useState(true);

  const visibleCandles = candles.slice(0, cursor);
  const currentCandle = visibleCandles[visibleCandles.length - 1] ?? null;

  const { positions, setPositions, handlePositionClosed } = usePositions(session?.ticker ?? "", true);
  const { placeTrade, closeTrade, error } = useTrades(positions, setPositions);

  const livePnLMap = positions.reduce((acc, p) => {
  if (!currentCandle) return acc;
  const id = p.position_id ?? (p as any).id;
  const direction = p.side === "long" ? 1 : -1;
  acc[id] = Math.round((currentCandle.close - p.entry_price) * direction * p.quantity * 100) / 100;
  return acc;
}, {} as Record<string, number>);

  const chartData = isCandle
    ? visibleCandles
    : visibleCandles.map((c) => ({ ...c, value: c.close }));

  const tradeUI = session && currentCandle ? (
    <>
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        <TradeButtons
        data={currentCandle}
        onTrade={(action) => placeTrade(action, currentCandle, session.ticker, session.session_id)}
        />
        <OpenPositions
        positions={positions}
        livePnLMap={livePnLMap}
        onClose={(positionId) => closeTrade(positionId, currentCandle?.close ?? 0, session.session_id)}
        />
    </>
    ) : null;

  return (
    <div className="p-4">
      {!session ? (
        <BacktestForm onSessionStart={(session, candles) => {
          setSession(session);
          setCandles(candles);
          setCursor(0);
        }} />
      ) : (
        <>
          <div className="flex justify-between items-center my-4">
            <h2 className="text-xl font-bold">{session.ticker} — Backtest</h2>
            <div className="flex gap-2">
              <button onClick={() => setIsCandle(true)} className={`px-3 py-1 rounded ${isCandle ? "bg-blue-600 text-white" : "bg-gray-600"}`}>
                Candlestick
              </button>
              <button onClick={() => setIsCandle(false)} className={`px-3 py-1 rounded ${!isCandle ? "bg-blue-600 text-white" : "bg-gray-600"}`}>
                Line
              </button>
            </div>
          </div>

          {chartData.length > 0 ? (
            isCandle
              ? <CandleStickChart data={chartData} renderTradeUI={tradeUI} trades={[]} />
              : <Linechart data={chartData} renderTradeUI={tradeUI} trades={[]} />
          ) : (
            <p className="text-zinc-500 text-sm">Press play to start replay...</p>
          )}

          <BacktestControls
            session={session}
            cursor={cursor}
            setCursor={setCursor}
            totalCandles={candles.length}
            playing={playing}
            setPlaying={setPlaying}
          />

          <BacktestStats
            session={session}
            candles={visibleCandles}
          />

          <TradingPanel
            positions={positions}
            livePnLMap={livePnLMap}
            onClose={(positionId) => closeTrade(positionId, currentCandle?.close ?? 0, session.session_id)}
          />
        </>
      )}
    </div>
  );
}