"use client";

import { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { CHART_INTERVALS, Interval } from "@/app/types/charts";
import { useChartData } from "./chartdata";
import { useStockSocket } from "@/app/hooks/useStockSocket";
import { usePositions } from "@/app/hooks/usePositions";
import { useTrades } from "../hooks/useTrades";
import { AppliedIndicator } from "@/app/indicators/language/types";
import { Candle, RawData } from "@/app/types/charts";
import { StockTick } from "@/app/types/websocket";
import { buildAnnotationPayload, saveUserAnnotation, updateUserStrategySnapshotAnnotations, AnnotationDraft, StrategyAnnotation, StrategySnapshot } from "@/app/handlers/annotations";
import { compareWindow, type SimilarityResult } from "./SimilaritySearch/similarity";
import { compareSemanticSnapshot, SemanticValidation } from "./SimilaritySearch/semantic";
import { buildValidationMarks } from "./chartrender/overlays/SemanticMarksOverlay";

const MAX_LENGTH_BOUNDARY_RATIO = 0.95;

export type ValidationCandidate = {
  candles: Candle[];
  result: SimilarityResult;
  semantic: SemanticValidation | null;
  referenceIndex: number;
};

type StrategyReference = Pick<StrategySnapshot, "candles" | "annotations">;
export type StrategyTeachingTool = "candle_group" | "zone" | "level" | "entry" | "exit" | "stop_loss" | "take_profit";
export type StrategyTeachingState = {
  strategyId: string;
  snapshotIndex: number;
  snapshot: StrategySnapshot;
  annotations: StrategyAnnotation[];
  tool: StrategyTeachingTool;
  label: string;
  importance: StrategyAnnotation["importance"];
  trigger: StrategyAnnotation["trigger"];
};

function bestReferenceMatch(references: StrategyReference[], semanticReferences: StrategySnapshot[], observed: Candle[]) {
  let best: { result: SimilarityResult; referenceIndex: number } | null = null;
  for (const [referenceIndex, reference] of references.entries()) {
    const result = compareWindow(reference.candles, observed);
    if (
      !best
      || (result.qualified && !best.result.qualified)
      || (result.qualified === best.result.qualified && result.scores.structure > best.result.scores.structure)
    ) best = { result, referenceIndex };
  }
  if (!best) return null;
  const structuralReference = references[best.referenceIndex];
  const semanticIndex = semanticReferences.findIndex((reference) => reference.candles === structuralReference.candles);
  const resolvedIndex = semanticIndex < 0 ? best.referenceIndex : semanticIndex;
  const semantic = best.result.qualified
    ? compareSemanticSnapshot(semanticReferences[resolvedIndex], observed, resolvedIndex, best.result.scores.structure)
    : null;
  return { ...best, semantic, rank: best.result.scores.structure * .75 + (semantic?.score ?? best.result.scores.structure) * .25 };
}

export type ValidationState =
  | { active: false }
  | {
      active: true;
      strategyId: string;
      strategyLabel: string;
      references: StrategyReference[];
      semanticReferences: StrategySnapshot[];
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
    snapshots: StrategySnapshot[],
  ) => void;
  stopValidation: () => void;
  acceptCandidate: () => Promise<void>;
  rejectCandidate: () => void;
  adjustCandidateBoundary: (boundary: "start" | "end", delta: -1 | 1) => void;
  strategyTeaching: StrategyTeachingState | null;
  openStrategyTeaching: (strategyId: string, snapshotIndex: number, snapshot: StrategySnapshot) => void;
  closeStrategyTeaching: () => void;
  setStrategyTeaching: (patch: Partial<Pick<StrategyTeachingState, "tool" | "label" | "importance" | "trigger">>) => void;
  setStrategyTeachingAnnotations: (annotations: StrategyAnnotation[]) => void;

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
  tradeReady: boolean;
  tradePending: boolean;
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
  const [strategyTeaching, updateTeaching] = useState<StrategyTeachingState | null>(null);
  const scanningRef = useRef(false);
  
  const [accountUnrealisedPnL, setAccountUnrealisedPnL] = useState(0);

  const stopAnnotation = useCallback(() => {
    setCreatingStrategy(false);
    setAnnotationStrategyLabel(null);
  }, []);

  const closeStrategyTeaching = useCallback(() => updateTeaching(null), []);
  const openStrategyTeaching = useCallback((strategyId: string, snapshotIndex: number, snapshot: StrategySnapshot) => {
    scanningRef.current = false;
    setValidation({ active: false });
    stopAnnotation();
    updateTeaching({
      strategyId, snapshotIndex, snapshot, annotations: snapshot.annotations,
      tool: "candle_group", label: "", importance: "preferred", trigger: "presence",
    });
  }, [stopAnnotation]);
  const setStrategyTeaching = useCallback((patch: Partial<Pick<StrategyTeachingState, "tool" | "label" | "importance" | "trigger">>) => {
    updateTeaching((current) => current ? { ...current, ...patch } : current);
  }, []);
  const setStrategyTeachingAnnotations = useCallback((annotations: StrategyAnnotation[]) => {
    updateTeaching((current) => current ? { ...current, annotations } : current);
  }, []);

  const startAnnotation = useCallback((strategyLabel?: string) => {
    scanningRef.current = false;
    setValidation({ active: false });
    closeStrategyTeaching();
    setAnnotationError(null);
    setAnnotationStrategyLabel(strategyLabel ?? null);
    setCreatingStrategy(true);
  }, [closeStrategyTeaching]);

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
  const { placeTrade, closeTrade, error, ready: tradeReady, placing: tradePending } = useTrades(positions, setPositions);
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

    const { references, semanticReferences, minLength, maxLength, scanIndex, historyRequest } = validation;
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
      let bestCandidate: ValidationCandidate | null = null;
      let bestRank = -Infinity;

      for (let len = minLength; len <= Math.min(maxLength, scanIndex + 1); len++) {
        const start = scanIndex - len + 1;
        if (start < 0) break;
        const window = scanData.slice(start, scanIndex + 1);
        const match = bestReferenceMatch(references, semanticReferences, window);
        if (match?.result.qualified && match.rank > bestRank) {
          bestRank = match.rank;
          bestCandidate = {
            candles: window, result: match.result, semantic: match.semantic,
            referenceIndex: match.referenceIndex,
          };
        }
      }

      const lengthBoundaryReached = bestCandidate !== null
        && maxLength > minLength
        && bestCandidate.candles.length / maxLength >= MAX_LENGTH_BOUNDARY_RATIO;

      if (bestCandidate && !lengthBoundaryReached) {
        setValidation((v) => v.active ? { ...v, candidate: bestCandidate } : v);
      } else {
        setValidation((v) => v.active ? { ...v, scanIndex: v.scanIndex - 1, scanned: v.scanned + 1 } : v);
      }
      scanningRef.current = false;
    }, 0);
  }, [validation, chartData, loadingMore, loadPreviousPage]);

  const startValidation = useCallback((
    strategyId: string,
    strategyLabel: string,
    snapshots: StrategySnapshot[],
  ) => {
    if (!chartData?.length || snapshots.length === 0) return;
    closeStrategyTeaching();
    stopAnnotation();
    const aggregate = snapshots.length >= 4;
    const semanticReferences = snapshots;
    const source = aggregate ? snapshots : snapshots.slice(-1);
    const references = source.map(({ candles, annotations }) => ({ candles, annotations }));
    const referenceLengths = references.map((reference) => reference.candles.length);
    const latestLength = references[references.length - 1].candles.length;
    const minLength = aggregate
      ? Math.min(...referenceLengths)
      : Math.max(5, Math.floor(latestLength * 0.5));
    const maxLength = aggregate
      ? Math.max(...referenceLengths)
      : Math.ceil(latestLength * 2);
    setValidation({
      active: true, strategyId, strategyLabel, references, semanticReferences, aggregate, minLength, maxLength,
      scanIndex: chartData.length - 1,
      scanned: 0,
      available: Math.max(0, chartData.length - maxLength),
      historyRequest: null,
      candidate: null,
      done: false,
    });
  }, [chartData, closeStrategyTeaching, stopAnnotation]);

  const stopValidation = useCallback(() => {
    setValidation({ active: false });
    scanningRef.current = false;
  }, []);

  const acceptCandidate = useCallback(async () => {
  if (!validation.active || !validation.candidate) return;

  const {
    strategyLabel,
    candidate,
    scanIndex,
    semanticReferences,
  } = validation;

  const candidateStartIndex =
    chartData?.findIndex(
      (candle) => candle.time === candidate.candles[0].time,
    ) ?? -1;

  if (candidateStartIndex < 0) return;

  const nextScanIndex = candidateStartIndex - 1;

  const draft: AnnotationDraft = {
    label: strategyLabel,
    timeStart: candidate.candles[0].time,
    timeEnd:
      candidate.candles[candidate.candles.length - 1].time,
    candles: candidate.candles,
  };

  const payload = buildAnnotationPayload(draft, shortname);

  const saved = await saveUserAnnotation(payload);

  if (candidate.semantic) {
    const projectedCandidate: ValidationCandidate = {
      ...candidate,
      candles: candidate.candles.map((candle, index) => ({
        ...candle,
        ...payload.candles[index],
      })),
    };

    const semanticAnnotations = buildValidationMarks(
      projectedCandidate,
      semanticReferences,
    ).map(({ annotation }) => annotation);

    if (semanticAnnotations.length > 0) {
      await updateUserStrategySnapshotAnnotations(
        saved.id,
        saved.snapshot_count - 1,
        semanticAnnotations,
      );
    }
  }

  setValidation((current) =>
    current.active
      ? {
          ...current,
          candidate: null,
          scanIndex: nextScanIndex,
          scanned:
            current.scanned +
            Math.min(
              scanIndex - nextScanIndex,
              Math.max(
                0,
                scanIndex - current.maxLength + 1,
              ),
            ),
        }
      : current,
  );
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

    const { candidate, references, semanticReferences } = validation;
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
    const match = bestReferenceMatch(references, semanticReferences, candles);
    if (!match) return;

    setValidation((v) => v.active && v.candidate
      ? { ...v, candidate: {
          candles, result: match.result, semantic: match.semantic,
          referenceIndex: match.referenceIndex,
        } }
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
        intervals: [...CHART_INTERVALS],
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
        strategyTeaching,
        openStrategyTeaching,
        closeStrategyTeaching,
        setStrategyTeaching,
        setStrategyTeachingAnnotations,
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
        tradeReady,
        tradePending,
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
