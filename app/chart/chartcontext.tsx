"use client";

import { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Interval } from "../types/charts";
import { useChartData } from "./chartdata";
import { useStockSocket } from "@/app/hooks/useStockSocket";
import { usePositions } from "@/app/hooks/usePositions";
import { useTrades } from "../hooks/useTrades";
import { AppliedIndicator } from "@/app/indicators/language/types";
import { Candle, RawData } from "@/app/types/charts";
import { StockTick } from "@/app/types/websocket";
import { buildAnnotationPayload, saveUserAnnotation, AnnotationDraft } from "@/app/handlers/annotations";
import { compareWindow, type SimilarityResult } from "./SimilaritySearch/similarity";

const intervals: Interval[] = ["1m", "5m", "15m", "1h", "1d", "1wk", "1mo"];

export type ValidationCandidate = {
  candles: Candle[];
  result: SimilarityResult;
};

type StrategyShape = Array<{ open: number; high: number; low: number; close: number }>;

function bestReferenceResult(references: StrategyShape[], observed: Candle[]): SimilarityResult | null {
  let best: SimilarityResult | null = null;

  for (const reference of references) {
    const result = compareWindow(reference, observed);
    if (
      !best
      || (result.qualified && !best.qualified)
      || (result.qualified === best.qualified && result.scores.structure > best.scores.structure)
    ) {
      best = result;
    }
  }

  return best;
}

export type ValidationState =
  | { active: false }
  | {
      active: true;
      strategyId: string;
      strategyLabel: string;
      references: StrategyShape[];
      aggregate: boolean;
      minLength: number;
      maxLength: number;
      scanIndex: number;
      scanned: number;
      available: number;
      historyRequest: { oldestTime: number; settled: boolean } | null;
      candidate: ValidationCandidate | null;
      done: boolean;
    };

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
  annotationStrategyLabel: string | null;
  startAnnotation: (strategyLabel?: string) => void;
  stopAnnotation: () => void;
  annotations: AnnotationDraft[];
  annotationError: string | null;
  handleAnnotation: (annotation: AnnotationDraft) => Promise<void>;
  validation: ValidationState;
  startValidation: (
    strategyId: string,
    strategyLabel: string,
    snapshots: StrategyShape[],
  ) => void;
  stopValidation: () => void;
  acceptCandidate: () => Promise<void>;
  rejectCandidate: () => void;
  adjustCandidateBoundary: (boundary: "start" | "end", delta: -1 | 1) => void;

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
  const [isCreatingStrategy, setCreatingStrategy] = useState(false);
  const [annotationStrategyLabel, setAnnotationStrategyLabel] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationDraft[]>([]);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [isIndicatorPanelOpen, setIsIndicatorPanelOpen] = useState(false);
  const [appliedIndicators, setAppliedIndicators] = useState<AppliedIndicator[]>([]);
  const [validation, setValidation] = useState<ValidationState>({ active: false });
  const scanningRef = useRef(false);
  
  const [accountUnrealisedPnL, setAccountUnrealisedPnL] = useState(0);

  const stopAnnotation = useCallback(() => {
    setCreatingStrategy(false);
    setAnnotationStrategyLabel(null);
  }, []);

  const startAnnotation = useCallback((strategyLabel?: string) => {
    scanningRef.current = false;
    setValidation({ active: false });
    setAnnotationError(null);
    setAnnotationStrategyLabel(strategyLabel ?? null);
    setCreatingStrategy(true);
  }, []);

  const setIsCreatingStrategy = useCallback((value: boolean) => {
    if (value) {
      startAnnotation();
      return;
    }
    stopAnnotation();
  }, [startAnnotation, stopAnnotation]);

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

  // Validation scan — advances one candle at a time, pauses when a candidate qualifies
  useEffect(() => {
    if (!validation.active || validation.done || validation.candidate !== null || scanningRef.current) return;

    const { references, minLength, maxLength, scanIndex, historyRequest } = validation;
    const scanData = chartData ?? [];

    if (historyRequest) {
      if (loadingMore) return;

      if (!historyRequest.settled) {
        setValidation((v) => v.active && v.historyRequest
          ? { ...v, historyRequest: { ...v.historyRequest, settled: true } }
          : v);
        return;
      }

      const prependedCount = scanData.findIndex((candle) => candle.time >= historyRequest.oldestTime);
      if (prependedCount > 0) {
        setValidation((v) => v.active ? {
          ...v,
          scanIndex: v.scanIndex + prependedCount,
          available: v.available + prependedCount,
          historyRequest: null,
        } : v);
      } else {
        setValidation((v) => v.active ? { ...v, historyRequest: null, done: true } : v);
      }
      return;
    }

    if (scanIndex - maxLength < 0) {
      const oldestTime = scanData[0]?.time;
      if (oldestTime == null) {
        setValidation((v) => v.active ? { ...v, done: true } : v);
        return;
      }
      loadPreviousPage();
      setValidation((v) => v.active ? {
        ...v,
        historyRequest: { oldestTime, settled: false },
      } : v);
      return;
    }

    scanningRef.current = true;
    setTimeout(() => {
      let bestResult: (SimilarityResult & { qualified: true }) | null = null;
      let bestCandles: Candle[] | null = null;

      for (let len = minLength; len <= Math.min(maxLength, scanIndex + 1); len++) {
        const start = scanIndex - len + 1;
        if (start < 0) break;
        const window = scanData.slice(start, scanIndex + 1);
        const result = bestReferenceResult(references, window);
        if (result?.qualified && (!bestResult || result.scores.structure > bestResult.scores.structure)) {
          bestResult = result;
          bestCandles = window;
        }
      }

      if (bestResult && bestCandles) {
        setValidation((v) => v.active ? { ...v, candidate: { candles: bestCandles!, result: bestResult! } } : v);
      } else {
        setValidation((v) => v.active ? { ...v, scanIndex: v.scanIndex - 1, scanned: v.scanned + 1 } : v);
      }
      scanningRef.current = false;
    }, 0);
  }, [validation, chartData, loadingMore, loadPreviousPage]);

  const startValidation = useCallback((
    strategyId: string,
    strategyLabel: string,
    snapshots: StrategyShape[],
  ) => {
    if (!chartData?.length || snapshots.length === 0) return;
    stopAnnotation();
    const aggregate = snapshots.length >= 4;
    const references = aggregate ? snapshots : snapshots.slice(-1);
    const referenceLengths = references.map((reference) => reference.length);
    const latestLength = references[references.length - 1].length;
    const minLength = aggregate
      ? Math.min(...referenceLengths)
      : Math.max(5, Math.floor(latestLength * 0.5));
    const maxLength = aggregate
      ? Math.max(...referenceLengths)
      : Math.ceil(latestLength * 2);
    setValidation({
      active: true, strategyId, strategyLabel, references, aggregate, minLength, maxLength,
      scanIndex: chartData.length - 1,
      scanned: 0,
      available: Math.max(0, chartData.length - maxLength),
      historyRequest: null,
      candidate: null,
      done: false,
    });
  }, [chartData, stopAnnotation]);

  const stopValidation = useCallback(() => {
    setValidation({ active: false });
    scanningRef.current = false;
  }, []);

  const acceptCandidate = useCallback(async () => {
    if (!validation.active || !validation.candidate) return;
    const { strategyLabel, candidate, scanIndex } = validation;
    const candidateStartIndex = chartData?.findIndex((candle) => candle.time === candidate.candles[0].time) ?? -1;
    if (candidateStartIndex < 0) return;
    const nextScanIndex = candidateStartIndex - 1;
    const draft: AnnotationDraft = {
      label: strategyLabel,
      timeStart: candidate.candles[0].time,
      timeEnd: candidate.candles[candidate.candles.length - 1].time,
      candles: candidate.candles,
    };
    await saveUserAnnotation(buildAnnotationPayload(draft, shortname));
    setValidation((v) => v.active
      ? {
          ...v,
          candidate: null,
          scanIndex: nextScanIndex,
          scanned: v.scanned + Math.min(
            scanIndex - nextScanIndex,
            Math.max(0, scanIndex - v.maxLength + 1),
          ),
        }
      : v);
  }, [validation, chartData, shortname]);

  const rejectCandidate = useCallback(() => {
    if (!validation.active || !validation.candidate) return;
    const { scanIndex, candidate } = validation;
    const candidateStartIndex = chartData?.findIndex((candle) => candle.time === candidate.candles[0].time) ?? -1;
    if (candidateStartIndex < 0) return;
    const nextScanIndex = candidateStartIndex - 1;
    setValidation((v) => v.active
      ? {
          ...v,
          candidate: null,
          scanIndex: nextScanIndex,
          scanned: v.scanned + Math.min(
            scanIndex - nextScanIndex,
            Math.max(0, scanIndex - v.maxLength + 1),
          ),
        }
      : v);
  }, [validation, chartData]);

  const adjustCandidateBoundary = useCallback((boundary: "start" | "end", delta: -1 | 1) => {
    if (!validation.active || !validation.candidate || !chartData?.length) return;

    const { candidate, references } = validation;
    const startIndex = chartData.findIndex((candle) => candle.time === candidate.candles[0].time);
    const endIndex = chartData.findIndex((candle) => candle.time === candidate.candles[candidate.candles.length - 1].time);
    if (startIndex < 0 || endIndex < 0) return;

    const nextStartIndex = boundary === "start"
      ? Math.max(0, Math.min(startIndex + delta, endIndex - 4))
      : startIndex;
    const nextEndIndex = boundary === "end"
      ? Math.min(chartData.length - 1, Math.max(endIndex + delta, startIndex + 4))
      : endIndex;
    if (nextStartIndex === startIndex && nextEndIndex === endIndex) return;

    const candles = chartData.slice(nextStartIndex, nextEndIndex + 1);
    const result = bestReferenceResult(references, candles);
    if (!result) return;

    setValidation((v) => v.active && v.candidate
      ? { ...v, candidate: { candles, result } }
      : v);
  }, [validation, chartData]);

  const handleAnnotation = async (annotation: AnnotationDraft) => {
    stopAnnotation();
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
        annotationStrategyLabel,
        startAnnotation,
        stopAnnotation,
        annotations,
        annotationError,
        handleAnnotation,
        validation,
        startValidation,
        stopValidation,
        acceptCandidate,
        rejectCandidate,
        adjustCandidateBoundary,
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
