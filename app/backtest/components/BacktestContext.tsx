"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type {
  BacktestPosition,
  BacktestSession,
} from "@/app/types/backend";
import type { RawData } from "@/app/types/charts";
import { deriveBacktestAnalysis, type BacktestAnalysis } from "../analysis";
import { saveBacktestSession } from "../services/backtest";

interface BacktestContextValue {
  session: BacktestSession | null;
  startSession: (session: BacktestSession, candles: RawData[]) => void;
  resetSession: () => void;
  resetReplay: () => void;
  candles: RawData[];
  cursor: number;
  setCursor: React.Dispatch<React.SetStateAction<number>>;
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  quantity: number;
  setQuantity: React.Dispatch<React.SetStateAction<number>>;
  positions: BacktestPosition[];
  openPositions: BacktestPosition[];
  livePnLMap: Record<string, number>;
  placeTrade: (
    action: "buy" | "sell",
    candle: RawData,
    ticker: string,
    quantity: number,
  ) => void;
  closeTrade: (tradeId: string, exitPrice: number) => void;
  error: string | null;
  visibleCandles: RawData[];
  currentCandle: RawData | null;
  analysis: BacktestAnalysis | null;
}

const BacktestContext = createContext<BacktestContextValue | null>(null);

export function BacktestProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<BacktestSession | null>(null);
  const [candles, setCandles] = useState<RawData[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [positions, setPositions] = useState<BacktestPosition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const snapshotRef = useRef({ cursor: 0, positions: [] as BacktestPosition[] });

  const visibleCandles = useMemo(() => candles.slice(0, cursor), [candles, cursor]);
  const currentCandle = visibleCandles[visibleCandles.length - 1] ?? null;
  const openPositions = useMemo(
    () => positions.filter((position) => position.exit_candle == null),
    [positions],
  );
  const livePnLMap = useMemo(() => {
    if (!currentCandle) return {};
    return openPositions.reduce<Record<string, number>>((map, position) => {
      const direction = position.side === "long" ? 1 : -1;
      map[position.trade_id] =
        (currentCandle.close - position.entry_price) * direction * position.quantity;
      return map;
    }, {});
  }, [currentCandle, openPositions]);
  const analysis = useMemo(() => session
    ? deriveBacktestAnalysis(session.starting_balance, candles, cursor, positions)
    : null, [candles, cursor, positions, session]);

  useEffect(() => {
    snapshotRef.current = { cursor, positions };
  }, [cursor, positions]);

  useEffect(() => {
    if (!session) return;
    const persist = () => {
      const snapshot = snapshotRef.current;
      saveBacktestSession(session.session_id, snapshot.cursor, snapshot.positions)
        .then(() => setError(null))
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Failed to save backtest"));
    };
    const interval = window.setInterval(persist, 2_000);
    return () => {
      window.clearInterval(interval);
      persist();
    };
  }, [session]);

  function startSession(next: BacktestSession, nextCandles: RawData[]) {
    setSession(next);
    setCandles(nextCandles);
    setCursor(next.current_candle ?? 0);
    setPositions(next.positions ?? []);
    setPlaying(false);
    setError(null);
  }

  function resetSession() {
    if (session) void saveBacktestSession(session.session_id, cursor, positions);
    setSession(null);
    setCandles([]);
    setCursor(0);
    setPositions([]);
    setPlaying(false);
    setError(null);
  }

  function resetReplay() {
    setCursor(0);
    setPositions([]);
    setPlaying(false);
  }

  function placeTrade(
    action: "buy" | "sell",
    candle: RawData,
    ticker: string,
    tradeQuantity: number,
  ) {
    if (!session || !currentCandle || tradeQuantity <= 0) return;
    const entryPrice = action === "buy" ? candle.buy_price ?? candle.close : candle.close;
    const entryCandle = Math.max(0, cursor - 1);
    const tradeId = crypto.randomUUID();
    setPositions((current) => [...current, {
      id: tradeId,
      trade_id: tradeId,
      symbol: ticker,
      side: action === "buy" ? "long" : "short",
      quantity: tradeQuantity,
      entry_price: entryPrice,
      entry_candle: entryCandle,
      entry_time: currentCandle.time,
      exit_price: null,
      exit_candle: null,
      exit_time: null,
      realised_pnl: null,
      status: "open",
      opened_at: new Date(currentCandle.time * 1000).toISOString(),
    }]);
  }

  function closeTrade(tradeId: string, exitPrice: number) {
    if (!currentCandle) return;
    setPositions((current) => current.map((position) => {
      if (position.trade_id !== tradeId || position.exit_candle != null) return position;
      const direction = position.side === "long" ? 1 : -1;
      return {
        ...position,
        exit_price: exitPrice,
        exit_candle: Math.max(0, cursor - 1),
        exit_time: currentCandle.time,
        realised_pnl: (exitPrice - position.entry_price) * direction * position.quantity,
        status: "closed" as const,
      };
    }));
  }

  return (
    <BacktestContext.Provider value={{
      session, startSession, resetSession, resetReplay,
      candles, cursor, setCursor, playing, setPlaying,
      quantity, setQuantity, positions, openPositions,
      livePnLMap, placeTrade, closeTrade, error,
      visibleCandles, currentCandle, analysis,
    }}>
      {children}
    </BacktestContext.Provider>
  );
}

export function useBacktestContext() {
  const context = useContext(BacktestContext);
  if (!context) throw new Error("useBacktestContext must be used inside BacktestProvider");
  return context;
}
