"use client";

import { createContext, useContext, useState, useMemo } from "react";
import type React from "react";
import { BacktestSession, BacktestCandle } from "@/app/types/backend";
import { usePositions } from "@/app/hooks/usePositions";
import { useTrades } from "@/app/hooks/useTrades";

interface BacktestContextValue {
  // Session lifecycle
  session:      BacktestSession | null;
  startSession: (session: BacktestSession, candles: BacktestCandle[]) => void;
  resetSession: () => void;

  // Replay controls
  candles:    BacktestCandle[];
  cursor:     number;
  setCursor:  React.Dispatch<React.SetStateAction<number>>;
  playing:    boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;

  // Chart display
  isCandle:    boolean;
  setIsCandle: React.Dispatch<React.SetStateAction<boolean>>;

  // Trade inputs
  quantity:    number;
  setQuantity: React.Dispatch<React.SetStateAction<number>>;

  // Trade state
  positions:    any[];
  setPositions: any;
  livePnLMap:   Record<string, number>;
  placeTrade:   (...args: any[]) => void;
  closeTrade:   (...args: any[]) => void;
  error:        string | null;

  // Derived — computed once here, consumed anywhere
  visibleCandles: BacktestCandle[];
  currentCandle:  BacktestCandle | null;
  chartData:      any[]; // OHLC[] in candle mode, { ...c, value }[] in line mode
}

const BacktestContext = createContext<BacktestContextValue | null>(null);

export function BacktestProvider({ children }: { children: React.ReactNode }) {
  const [session,  setSession]  = useState<BacktestSession | null>(null);
  const [candles,  setCandles]  = useState<BacktestCandle[]>([]);
  const [cursor,   setCursor]   = useState(0);
  const [playing,  setPlaying]  = useState(false);
  const [isCandle, setIsCandle] = useState(true);
  const [quantity, setQuantity] = useState(1);

  const visibleCandles = candles.slice(0, cursor);
  const currentCandle  = visibleCandles[visibleCandles.length - 1] ?? null;

  // Hooks called unconditionally — empty ticker before session starts is harmless
  const { positions, setPositions } = usePositions(session?.ticker ?? "", true);
  const { placeTrade, closeTrade, error } = useTrades(positions, setPositions);

  const livePnLMap = positions.reduce<Record<string, number>>((acc, p) => {
    if (!currentCandle) return acc;
    const direction = p.side === "long" ? 1 : -1;
    acc[p.trade_id] = Math.round(
      (currentCandle.close - p.entry_price) * direction * p.quantity * 100,
    ) / 100;
    return acc;
  }, {});

  // AreaSeries needs a `value` field; CandlestickSeries wants raw OHLC
  const chartData = isCandle
    ? visibleCandles
    : visibleCandles.map((c) => ({ ...c, value: c.close }));

  function startSession(sess: BacktestSession, cands: BacktestCandle[]) {
    setSession(sess);
    setCandles(cands);
    setCursor(0);
    setPlaying(false);
  }

  function resetSession() {
    setSession(null);
    setCandles([]);
    setCursor(0);
    setPlaying(false);
  }

  return (
    <BacktestContext.Provider value={{
      session, startSession, resetSession,
      candles, cursor, setCursor, playing, setPlaying,
      isCandle, setIsCandle,
      quantity, setQuantity,
      positions, setPositions, livePnLMap, placeTrade, closeTrade, error,
      visibleCandles, currentCandle, chartData,
    }}>
      {children}
    </BacktestContext.Provider>
  );
}

export function useBacktestContext() {
  const ctx = useContext(BacktestContext);
  if (!ctx) throw new Error("useBacktestContext must be used inside <BacktestProvider>");
  return ctx;
}