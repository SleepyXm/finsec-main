"use client";

import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Interval } from "../types/charts";
import { useChartData } from "./chartdata";
import { useStockSocket } from "@/app/hooks/useStockSocket";
import { usePositions } from "@/app/hooks/usePositions";
import { useTrades } from "../hooks/useTrades";
import type { AppliedIndicator } from "@/app/indicators/language/types";
import type { Candle, RawData } from "@/app/types/charts";
import type { StockTick } from "@/app/types/websocket";
import {
  buildAnnotationPayload,
  saveUserAnnotation,
  type AnnotationDraft,
} from "@/app/handlers/annotations";

const intervals: Interval[] = ["1m", "5m", "15m", "1h", "1d", "1wk", "1mo"];

interface ChartContextValue {
  // ticker
  shortname: string;
  intervals: Interval[];

  // interval + chart type
  interval: Interval;
  setInterval: (i: Interval) => void;
  isCandle: boolean;
  setIsCandle: (v: boolean) => void;

  // strategy
  isCreatingStrategy: boolean;
  setIsCreatingStrategy: (v: boolean) => void;
  annotations: AnnotationDraft[];
  annotationError: string | null;
  handleAnnotation: (annotation: AnnotationDraft) => Promise<void>;

  // indicator Editor
  isIndicatorPanelOpen: boolean
  setIsIndicatorPanelOpen: (value: boolean) => void
  appliedIndicators: AppliedIndicator[];
  applyIndicator: (indicator: AppliedIndicator) => void;
  removeIndicator: (id: string) => void;
  setIndicatorEnabled: (id: string, enabled: boolean) => void;

  // live data
  tick: StockTick | null;
  connected: boolean;
  chartData: Candle[];

  // positions + trades
  positions: any[];
  livePnLMap: Record<string, number>;
  accountUnrealisedPnL: number;
  placeTrade: (
    action: "buy" | "sell",
    tick: Pick<RawData, "buy_price" | "close">,
    symbol: string,
    quantity: number,
  ) => void;
  closeTrade: (id: string, price: number) => void;
  updatePosition: (id: string, patch: any) => Promise<any>;
  handlePositionClosed: (id: string) => void;
  error: string | null;

  // router
  router: ReturnType<typeof useRouter>;

  loadingMore: boolean;
  loadPreviousPage: () => void;
}

const ChartContext = createContext<ChartContextValue | null>(null);

export function useChartContext() {
  const ctx = useContext(ChartContext);
  if (!ctx) throw new Error("useChartContext must be used inside ChartProvider");
  return ctx;
}

export function ChartProvider({
  children,
  symbol,
  intervalOverride,
  isCandleOverride,
}: {
  children: ReactNode;
  symbol?: string;
  intervalOverride?: Interval;
  isCandleOverride?: boolean;
}) {
  const params = useParams();
  const router = useRouter();
  const symbolParam = symbol ?? (typeof params.symbol === "string" ? decodeURIComponent(params.symbol) : "");
  const shortname = symbolParam.toUpperCase();

  const [localInterval, setInterval] = useState<Interval>(intervalOverride ?? "5m");
  const [localIsCandle, setIsCandle] = useState(isCandleOverride ?? true);
  const interval = intervalOverride ?? localInterval;
  const isCandle = isCandleOverride ?? localIsCandle;
  const [isCreatingStrategy, setIsCreatingStrategy] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationDraft[]>([]);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [isIndicatorPanelOpen, setIsIndicatorPanelOpen] = useState(false);
  const [appliedIndicators, setAppliedIndicators] = useState<AppliedIndicator[]>([]);
  
  const [accountUnrealisedPnL, setAccountUnrealisedPnL] = useState(0);

  const applyIndicator = useCallback((indicator: AppliedIndicator) => {
    setAppliedIndicators((current) => {
      const existingIndex = current.findIndex((entry) => entry.id === indicator.id);
      if (existingIndex === -1) return [...current, indicator];
      const next = [...current];
      next[existingIndex] = indicator;
      return next;
    });
  }, []);

  const removeIndicator = useCallback((id: string) => {
    setAppliedIndicators((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const setIndicatorEnabled = useCallback((id: string, enabled: boolean) => {
    setAppliedIndicators((current) => current.map((entry) =>
      entry.id === id ? { ...entry, enabled } : entry
    ));
  }, []);

  const { positions, setPositions, handlePositionClosed, updatePosition } = usePositions(shortname);
  const { placeTrade, closeTrade, error } = useTrades(positions, setPositions);
  const { tick, historicalData, connected, livePnLMap, loadingMore, loadPreviousPage } = useStockSocket(
    shortname, interval, positions, handlePositionClosed, setAccountUnrealisedPnL
  );
  const { data, updateLastCandle } = useChartData(shortname, interval, historicalData);

  useEffect(() => {
    if (!tick) return;
    updateLastCandle({
      time: tick.time,
      open: tick.open,
      high: tick.high,
      low: tick.low,
      close: tick.close,
      volume: tick.volume,
      buy_price: tick.buy_price,
    });
  }, [tick]);

  const chartData = isCandle
    ? data
    : data?.map((item) => ({ ...item, value: item.close }));

  const handleAnnotation = async (annotation: AnnotationDraft) => {
    setIsCreatingStrategy(false);
    setAnnotationError(null);
    try {
      if (!annotation.candles || annotation.candles.length < 5) {
        throw new Error("Select at least five candles for a strategy snapshot.");
      }
      await saveUserAnnotation(buildAnnotationPayload(annotation, shortname));
      setAnnotations((current) => [...current, annotation]);
    } catch (cause) {
      setAnnotationError(cause instanceof Error ? cause.message : "Failed to save strategy snapshot");
    }
  };

  return (
    <ChartContext.Provider
      value={{
        shortname,
        intervals,
        interval,
        setInterval,
        isCandle,
        setIsCandle,
        isCreatingStrategy,
        setIsCreatingStrategy,
        annotations,
        annotationError,
        handleAnnotation,
        isIndicatorPanelOpen,
        setIsIndicatorPanelOpen,
        appliedIndicators,
        applyIndicator,
        removeIndicator,
        setIndicatorEnabled,
        tick,
        connected,
        chartData: chartData ?? [],
        positions,
        livePnLMap,
        loadingMore,
        loadPreviousPage,
        accountUnrealisedPnL,
        placeTrade,
        closeTrade,
        updatePosition,
        handlePositionClosed,
        error,
        router,
      }}
    >
      {children}
    </ChartContext.Provider>
  );
}
