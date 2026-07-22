"use client";

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { CHART_INTERVALS, Interval, Candle, RawData } from "@/app/components/types/charts";
import { useChartData } from "./chartdata";
import { useStockSocket } from "@/app/components/hooks/useStockSocket";
import { usePositions } from "@/app/components/hooks/usePositions";
import { useTrades } from "@/app/components/hooks/useTrades";
import { AppliedIndicator } from "@/app/features/indicators/language/types";
import { StockTick } from "@/app/components/types/websocket";
import {
  AnnotationDraft,
  StrategyAnnotation,
  StrategySnapshot,
  buildAnnotationPayload,
  saveUserAnnotation,
  updateUserStrategySnapshotAnnotations,
} from "@/app/components/handlers/annotations";
import {
  alignCandleStructure,
  compareWindow,
  type SimilarityResult,
} from "./SimilaritySearch/similarity";
import {
  SemanticValidation,
  compareSemanticSnapshot,
  scoreAnnotation,
} from "./SimilaritySearch/semantic";
import { buildValidationMarks } from "./chartrender/overlays/SemanticMarksOverlay";

const MAX_LENGTH_BOUNDARY_RATIO = 0.95;

export type ValidationCandidate = {
  candles: Candle[];
  result: SimilarityResult;
  semantic: SemanticValidation | null;
  referenceIndex: number;
};

export type CandidateBoundaryAdjustment =
  | { target: "candidate"; boundary: "start" | "end"; delta: -1 | 1 }
  | {
      target: "semantic";
      annotationId: string;
      boundary: "start" | "end";
      candleIndex: number;
    }
  | {
      target: "marker";
      annotationId: string;
      candleIndex: number;
      priceAnchor: "open" | "high" | "low" | "close";
    };

type StrategyReference = Pick<StrategySnapshot, "candles" | "annotations">;

export type StrategyTeachingTool =
  | "candle_group"
  | "zone"
  | "level"
  | "entry"
  | "exit"
  | "stop_loss"
  | "take_profit";

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

function bestReferenceMatch(
  references: StrategyReference[],
  semanticReferences: StrategySnapshot[],
  observed: Candle[],
) {
  let best: { result: SimilarityResult; referenceIndex: number } | null = null;

  for (const [referenceIndex, reference] of references.entries()) {
    const result = compareWindow(reference.candles, observed);

    if (
      !best ||
      (result.qualified && !best.result.qualified) ||
      (
        result.qualified === best.result.qualified &&
        result.scores.structure > best.result.scores.structure
      )
    ) {
      best = { result, referenceIndex };
    }
  }

  if (!best) return null;

  const structuralReference = references[best.referenceIndex];

  const semanticIndex = semanticReferences.findIndex(
    (reference) => reference.candles === structuralReference.candles,
  );

  const resolvedIndex = semanticIndex < 0 ? best.referenceIndex : semanticIndex;

  const semantic = best.result.qualified
    ? compareSemanticSnapshot(
        semanticReferences[resolvedIndex],
        observed,
        resolvedIndex,
        best.result.scores.structure,
      )
    : null;

  const rank =
    best.result.scores.structure * 0.75 +
    (semantic?.score ?? best.result.scores.structure) * 0.25;

  return { ...best, semantic, rank };
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
  shortname: string;
  intervals: Interval[];
  interval: Interval;
  setInterval: (interval: Interval) => void;
  isCandle: boolean;
  setIsCandle: (value: boolean) => void;
  isCreatingStrategy: boolean;
  setIsCreatingStrategy: (value: boolean) => void;
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
  adjustCandidateBoundary: (adjustment: CandidateBoundaryAdjustment) => void;
  strategyTeaching: StrategyTeachingState | null;
  openStrategyTeaching: (
    strategyId: string,
    snapshotIndex: number,
    snapshot: StrategySnapshot,
  ) => void;
  closeStrategyTeaching: () => void;
  setStrategyTeaching: (
    patch: Partial<
      Pick<StrategyTeachingState, "tool" | "label" | "importance" | "trigger">
    >,
  ) => void;
  setStrategyTeachingAnnotations: (annotations: StrategyAnnotation[]) => void;
  isIndicatorPanelOpen: boolean;
  setIsIndicatorPanelOpen: (value: boolean) => void;
  appliedIndicators: AppliedIndicator[];
  applyIndicator: (indicator: AppliedIndicator) => void;
  removeIndicator: (id: string) => void;
  setIndicatorEnabled: (id: string, enabled: boolean) => void;
  tick: StockTick | null;
  connected: boolean;
  chartData: Candle[];
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
  router: ReturnType<typeof useRouter>;
  loadingMore: boolean;
  loadPreviousPage: () => void;
}

const ChartContext = createContext<ChartContextValue | null>(null);

export function useChartContext() {
  const context = useContext(ChartContext);

  if (!context) {
    throw new Error("useChartContext must be used inside ChartProvider");
  }

  return context;
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

  const symbolParam =
    symbol ??
    (typeof params.symbol === "string" ? decodeURIComponent(params.symbol) : "");

  const shortname = symbolParam.toUpperCase();

  const [localInterval, setInterval] = useState<Interval>(intervalOverride ?? "5m");
  const [localIsCandle, setIsCandle] = useState(isCandleOverride ?? true);
  const [isCreatingStrategy, setCreatingStrategy] = useState(false);
  const [annotationStrategyLabel, setAnnotationStrategyLabel] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationDraft[]>([]);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [isIndicatorPanelOpen, setIsIndicatorPanelOpen] = useState(false);
  const [appliedIndicators, setAppliedIndicators] = useState<AppliedIndicator[]>([]);
  const [validation, setValidation] = useState<ValidationState>({ active: false });
  const [strategyTeaching, updateTeaching] = useState<StrategyTeachingState | null>(null);
  const [accountUnrealisedPnL, setAccountUnrealisedPnL] = useState(0);

  const scanningRef = useRef(false);

  const interval = intervalOverride ?? localInterval;
  const isCandle = isCandleOverride ?? localIsCandle;

  const stopAnnotation = useCallback(() => {
    setCreatingStrategy(false);
    setAnnotationStrategyLabel(null);
  }, []);

  const closeStrategyTeaching = useCallback(() => {
    updateTeaching(null);
  }, []);

  const openStrategyTeaching = useCallback(
    (
      strategyId: string,
      snapshotIndex: number,
      snapshot: StrategySnapshot,
    ) => {
      scanningRef.current = false;
      setValidation({ active: false });
      stopAnnotation();

      updateTeaching({
        strategyId,
        snapshotIndex,
        snapshot,
        annotations: snapshot.annotations,
        tool: "candle_group",
        label: "",
        importance: "preferred",
        trigger: "presence",
      });
    },
    [stopAnnotation],
  );

  const setStrategyTeaching = useCallback(
    (
      patch: Partial<
        Pick<StrategyTeachingState, "tool" | "label" | "importance" | "trigger">
      >,
    ) => {
      updateTeaching((current) => current ? { ...current, ...patch } : current);
    },
    [],
  );

  const setStrategyTeachingAnnotations = useCallback(
    (nextAnnotations: StrategyAnnotation[]) => {
      updateTeaching((current) =>
        current ? { ...current, annotations: nextAnnotations } : current,
      );
    },
    [],
  );

  const startAnnotation = useCallback(
    (strategyLabel?: string) => {
      scanningRef.current = false;
      setValidation({ active: false });
      closeStrategyTeaching();
      setAnnotationError(null);
      setAnnotationStrategyLabel(strategyLabel ?? null);
      setCreatingStrategy(true);
    },
    [closeStrategyTeaching],
  );

  const setIsCreatingStrategy = useCallback(
    (value: boolean) => {
      if (value) {
        startAnnotation();
        return;
      }

      stopAnnotation();
    },
    [startAnnotation, stopAnnotation],
  );

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
    setAppliedIndicators((current) =>
      current.map((entry) => entry.id === id ? { ...entry, enabled } : entry),
    );
  }, []);

  const {
    positions,
    setPositions,
    handlePositionClosed,
    updatePosition,
  } = usePositions(shortname);

  const {
    placeTrade,
    closeTrade,
    error,
    ready: tradeReady,
    placing: tradePending,
  } = useTrades(positions, setPositions);

  const {
    tick,
    historicalData,
    connected,
    livePnLMap,
    loadingMore,
    loadPreviousPage,
  } = useStockSocket(
    shortname,
    interval,
    positions,
    handlePositionClosed,
    setAccountUnrealisedPnL,
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

  useEffect(() => {
    if (
      !validation.active ||
      validation.done ||
      validation.candidate !== null ||
      scanningRef.current
    ) {
      return;
    }

    const {
      references,
      semanticReferences,
      minLength,
      maxLength,
      scanIndex,
      historyRequest,
    } = validation;

    const scanData = chartData ?? [];

    if (historyRequest) {
      if (loadingMore) return;

      if (!historyRequest.settled) {
        setValidation((current) =>
          current.active && current.historyRequest
            ? {
                ...current,
                historyRequest: { ...current.historyRequest, settled: true },
              }
            : current,
        );

        return;
      }

      const prependedCount = scanData.findIndex(
        (candle) => candle.time >= historyRequest.oldestTime,
      );

      if (prependedCount > 0) {
        setValidation((current) =>
          current.active
            ? {
                ...current,
                scanIndex: current.scanIndex + prependedCount,
                available: current.available + prependedCount,
                historyRequest: null,
              }
            : current,
        );
      } else {
        setValidation((current) =>
          current.active
            ? { ...current, historyRequest: null, done: true }
            : current,
        );
      }

      return;
    }

    if (scanIndex - maxLength < 0) {
      const oldestTime = scanData[0]?.time;

      if (oldestTime == null) {
        setValidation((current) =>
          current.active ? { ...current, done: true } : current,
        );

        return;
      }

      loadPreviousPage();

      setValidation((current) =>
        current.active
          ? {
              ...current,
              historyRequest: { oldestTime, settled: false },
            }
          : current,
      );

      return;
    }

    scanningRef.current = true;

    setTimeout(() => {
      let bestCandidate: ValidationCandidate | null = null;
      let bestRank = -Infinity;

      for (
        let length = minLength;
        length <= Math.min(maxLength, scanIndex + 1);
        length += 1
      ) {
        const start = scanIndex - length + 1;
        if (start < 0) break;

        const window = scanData.slice(start, scanIndex + 1);
        const match = bestReferenceMatch(references, semanticReferences, window);

        if (match?.result.qualified && match.rank > bestRank) {
          bestRank = match.rank;

          bestCandidate = {
            candles: window,
            result: match.result,
            semantic: match.semantic,
            referenceIndex: match.referenceIndex,
          };
        }
      }

      const lengthBoundaryReached =
        bestCandidate !== null &&
        maxLength > minLength &&
        bestCandidate.candles.length / maxLength >= MAX_LENGTH_BOUNDARY_RATIO;

      if (bestCandidate && !lengthBoundaryReached) {
        setValidation((current) =>
          current.active ? { ...current, candidate: bestCandidate } : current,
        );
      } else {
        setValidation((current) =>
          current.active
            ? {
                ...current,
                scanIndex: current.scanIndex - 1,
                scanned: current.scanned + 1,
              }
            : current,
        );
      }

      scanningRef.current = false;
    }, 0);
  }, [validation, chartData, loadingMore, loadPreviousPage]);

  const startValidation = useCallback(
    (
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

      const references = source.map(({ candles, annotations: snapshotAnnotations }) => ({
        candles,
        annotations: snapshotAnnotations,
      }));

      const referenceLengths = references.map((reference) => reference.candles.length);
      const latestLength = references[references.length - 1].candles.length;

      const minLength = aggregate
        ? Math.min(...referenceLengths)
        : Math.max(5, Math.floor(latestLength * 0.5));

      const maxLength = aggregate
        ? Math.max(...referenceLengths)
        : Math.ceil(latestLength * 2);

      setValidation({
        active: true,
        strategyId,
        strategyLabel,
        references,
        semanticReferences,
        aggregate,
        minLength,
        maxLength,
        scanIndex: chartData.length - 1,
        scanned: 0,
        available: Math.max(0, chartData.length - maxLength),
        historyRequest: null,
        candidate: null,
        done: false,
      });
    },
    [chartData, closeStrategyTeaching, stopAnnotation],
  );

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
      chartData?.findIndex((candle) => candle.time === candidate.candles[0].time) ?? -1;

    if (candidateStartIndex < 0) return;

    const nextScanIndex = candidateStartIndex - 1;

    const draft: AnnotationDraft = {
      label: strategyLabel,
      timeStart: candidate.candles[0].time,
      timeEnd: candidate.candles[candidate.candles.length - 1].time,
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

      if (semanticAnnotations.length) {
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
                Math.max(0, scanIndex - current.maxLength + 1),
              ),
          }
        : current,
    );
  }, [validation, chartData, shortname]);

  const rejectCandidate = useCallback(() => {
    if (!validation.active || !validation.candidate) return;

    const { scanIndex, candidate } = validation;

    const candidateStartIndex =
      chartData?.findIndex((candle) => candle.time === candidate.candles[0].time) ?? -1;

    if (candidateStartIndex < 0) return;

    const nextScanIndex = candidateStartIndex - 1;

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
                Math.max(0, scanIndex - current.maxLength + 1),
              ),
          }
        : current,
    );
  }, [validation, chartData]);

  const adjustCandidateBoundary = useCallback(
    (adjustment: CandidateBoundaryAdjustment) => {
      if (!chartData?.length) return;

      setValidation((current) => {
        if (!current.active || !current.candidate) return current;

        const candidate = current.candidate;

        if (adjustment.target === "candidate") {
          const startIndex = chartData.findIndex(
            (candle) => candle.time === candidate.candles[0].time,
          );

          const endIndex = chartData.findIndex(
            (candle) => candle.time === candidate.candles[candidate.candles.length - 1].time,
          );

          if (startIndex < 0 || endIndex < 0) return current;

          const nextStartIndex =
            adjustment.boundary === "start"
              ? Math.max(0, Math.min(startIndex + adjustment.delta, endIndex - 4))
              : startIndex;

          const nextEndIndex =
            adjustment.boundary === "end"
              ? Math.min(
                  chartData.length - 1,
                  Math.max(endIndex + adjustment.delta, startIndex + 4),
                )
              : endIndex;

          if (nextStartIndex === startIndex && nextEndIndex === endIndex) {
            return current;
          }

          const candles = chartData.slice(nextStartIndex, nextEndIndex + 1);

          const match = bestReferenceMatch(
            current.references,
            current.semanticReferences,
            candles,
          );

          if (!match) return current;

          return {
            ...current,
            candidate: {
              candles,
              result: match.result,
              semantic: match.semantic,
              referenceIndex: match.referenceIndex,
            },
          };
        }

        if (!candidate.semantic) return current;

        const semantic = candidate.semantic;
        const last = candidate.candles.length - 1;

        if (last < 0) return current;

        const candleIndex = Math.max(0, Math.min(last, adjustment.candleIndex));

        if (adjustment.target === "marker") {
          const execution = semantic.execution.map((placement) =>
            placement.id === adjustment.annotationId
              ? {
                  ...placement,
                  matchedStartIndex: candleIndex,
                  matchedEndIndex: candleIndex,
                  priceAnchor: adjustment.priceAnchor,
                }
              : placement,
          );

          return {
            ...current,
            candidate: {
              ...candidate,
              semantic: { ...semantic, execution },
            },
          };
        }

        const currentResult = semantic.results.find(
          (result) => result.id === adjustment.annotationId,
        );

        if (!currentResult) return current;

        const reference = current.semanticReferences[currentResult.referenceIndex];

        const referenceAnnotation =
          reference?.annotations.find((annotation) => annotation.id === currentResult.id) ??
          reference?.annotations.find(
            (annotation) => annotation.conceptId === currentResult.conceptId,
          );

        if (
          !reference ||
          !referenceAnnotation ||
          referenceAnnotation.kind !== "candle_group"
        ) {
          return current;
        }

        const start =
          adjustment.boundary === "start"
            ? Math.min(candleIndex, currentResult.matchedEndIndex)
            : currentResult.matchedStartIndex;

        const end =
          adjustment.boundary === "end"
            ? Math.max(candleIndex, currentResult.matchedStartIndex)
            : currentResult.matchedEndIndex;

        const alignment = alignCandleStructure(reference.candles, candidate.candles);
        if (!alignment.length) return current;

        const match = scoreAnnotation(
          reference.candles,
          candidate.candles,
          referenceAnnotation,
          alignment,
          { start, end },
        );

        const results = semantic.results.map((result) =>
          result.id === adjustment.annotationId
            ? {
                ...result,
                score: match.score,
                passed: result.importance !== "required" || match.score >= 70,
                matchedStartIndex: match.start,
                matchedEndIndex: match.end,
              }
            : result,
        );

        const totalWeight = results.reduce(
          (sum, result) => sum + (result.importance === "required" ? 2 : 1),
          0,
        );

        const score = totalWeight
          ? results.reduce(
              (sum, result) =>
                sum + result.score * (result.importance === "required" ? 2 : 1),
              0,
            ) / totalWeight
          : candidate.result.scores.structure;

        return {
          ...current,
          candidate: {
            ...candidate,
            semantic: {
              ...semantic,
              results,
              score,
              qualified: results.every((result) => result.passed),
            },
          },
        };
      });
    },
    [chartData],
  );

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
      setAnnotationError(
        cause instanceof Error ? cause.message : "Failed to save strategy snapshot",
      );
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
        accountUnrealisedPnL,
        placeTrade,
        closeTrade,
        tradeReady,
        tradePending,
        updatePosition,
        handlePositionClosed,
        error,
        router,
        loadingMore,
        loadPreviousPage,
      }}
    >
      {children}
    </ChartContext.Provider>
  );
}