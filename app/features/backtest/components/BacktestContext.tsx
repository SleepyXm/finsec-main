"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import { BacktestPosition, BacktestSession } from "@/app/components/types/backend";
import { RawData } from "@/app/components/types/charts";
import { deriveBacktestAnalysis, BacktestAnalysis } from "../analysis";
import { saveBacktestSession } from "../services/backtest";
import { MAX_TRADE_QUANTITY } from "@/app/components/types/trades";
import {
  createForwardPassState,
  reconcileForwardPass,
} from "@/app/features/StrategyEngine/forward";
import type {
  ForwardPassState,
  StrategyDetails,
} from "@/app/features/StrategyEngine/types";

interface BacktestContextValue {
  session: BacktestSession | null;
  activeStrategy: StrategyDetails | null;
  forwardPass: ForwardPassState | null;
  startSession: (
    session: BacktestSession,
    candles: RawData[],
    strategy: StrategyDetails | null,
  ) => void;
  resetSession: () => void;
  resetReplay: () => void;
  candles: RawData[];
  cursor: number;
  setCursor: (cursor: number) => void;
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
  const [activeStrategy, setActiveStrategy] =
    useState<StrategyDetails | null>(null);
  const [forwardPass, setForwardPass] =
    useState<ForwardPassState | null>(null);
  const [candles, setCandles] = useState<RawData[]>([]);
  const [cursor, setCursorState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [positions, setPositions] = useState<BacktestPosition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const snapshotRef = useRef({ cursor: 0, positions: [] as BacktestPosition[] });
  const lastSavedRef = useRef("");
  const savingRef = useRef(false);
  const forwardPassRef =
    useRef<ForwardPassState | null>(null);

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
      const fingerprint = JSON.stringify(snapshot);
      if (savingRef.current || fingerprint === lastSavedRef.current) return;
      savingRef.current = true;
      saveBacktestSession(session.session_id, snapshot.cursor, snapshot.positions)
        .then(() => {
          lastSavedRef.current = fingerprint;
          setError(null);
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Failed to save backtest"))
        .finally(() => { savingRef.current = false; });
    };
    const interval = window.setInterval(persist, 2_000);
    return () => {
      window.clearInterval(interval);
      persist();
    };
  }, [session]);

  function startSession(
    next: BacktestSession,
    nextCandles: RawData[],
    strategy: StrategyDetails | null,
  ) {
    const sessionStrategyId =
      next.strategy_id ?? null;
    const loadedStrategyId = strategy?.id ?? null;

    if (sessionStrategyId !== loadedStrategyId) {
      throw new Error(
        "The selected strategy does not match this backtest.",
      );
    }

    const nextCursor = Math.max(0, Math.min(next.current_candle ?? 0, nextCandles.length));
    const nextPositions = next.positions ?? [];
    setSession(next);
    setActiveStrategy(strategy);
    setCandles(nextCandles);
    setCursorState(nextCursor);
    setPositions(nextPositions);
    snapshotRef.current = { cursor: nextCursor, positions: nextPositions };
    lastSavedRef.current = JSON.stringify(snapshotRef.current);
    const nextForwardPass = strategy
      ? reconcileForwardPass(
          null,
          nextCandles.slice(0, nextCursor),
          strategy.snapshots,
          strategy.id,
        )
      : null;
    forwardPassRef.current = nextForwardPass;
    setForwardPass(nextForwardPass);
    setPlaying(false);
    setError(null);
  }

  function resetSession() {
    if (session) void saveBacktestSession(session.session_id, cursor, positions);
    setSession(null);
    setActiveStrategy(null);
    setForwardPass(null);
    forwardPassRef.current = null;
    setCandles([]);
    setCursorState(0);
    setPositions([]);
    setPlaying(false);
    setError(null);
    lastSavedRef.current = "";
  }

  function resetReplay() {
    setCursorState(0);
    setPositions([]);
    setPlaying(false);
    forwardPassRef.current = activeStrategy
      ? createForwardPassState(activeStrategy.id)
      : null;
    setForwardPass(forwardPassRef.current);
  }

  const setCursor = useCallback((nextCursor: number) => {
    const bounded = Math.max(
      0,
      Math.min(nextCursor, candles.length),
    );
    const nextForwardPass = activeStrategy
      ? reconcileForwardPass(
          forwardPassRef.current,
          candles.slice(0, bounded),
          activeStrategy.snapshots,
          activeStrategy.id,
        )
      : null;

    forwardPassRef.current = nextForwardPass;
    setForwardPass(nextForwardPass);
    setCursorState(bounded);
  }, [
    activeStrategy,
    candles,
  ]);

  function placeTrade(
    action: "buy" | "sell",
    candle: RawData,
    ticker: string,
    tradeQuantity: number,
  ) {
    if (!session || !currentCandle) return;
    if (!Number.isFinite(tradeQuantity) || tradeQuantity <= 0 || tradeQuantity > MAX_TRADE_QUANTITY) {
      setError(`Quantity must be between 1 and ${MAX_TRADE_QUANTITY.toLocaleString()}.`);
      return;
    }
    if (positions.length >= 1_000) {
      setError("This backtest already contains the maximum number of positions.");
      return;
    }
    const entryPrice = action === "buy" ? candle.buy_price ?? candle.close : candle.close;
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      setError("Valid price data is not available for this candle.");
      return;
    }
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
    if (!currentCandle || !Number.isFinite(exitPrice) || exitPrice <= 0) return;
    setPositions((current) => current.map((position) => {
      if (position.trade_id !== tradeId || position.exit_candle != null) return position;
      const direction = position.side === "long" ? 1 : -1;
      return {
        ...position,
        exit_price: exitPrice,
        exit_candle: Math.max(0, cursor - 1),
        exit_time: currentCandle.time,
        realised_pnl: Math.round((exitPrice - position.entry_price) * direction * position.quantity * 100) / 100,
        status: "closed" as const,
      };
    }));
  }

  return (
    <BacktestContext.Provider value={{
      session, activeStrategy, forwardPass,
      startSession, resetSession, resetReplay,
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
