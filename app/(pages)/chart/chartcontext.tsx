"use client";

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useParams } from "next/navigation";
import { CHART_INTERVALS, Interval, Candle, RawData } from "@/app/components/types/charts";
import { useChartData } from "./chartdata";
import { useStockSocket, type ChartLoadState } from "@/app/components/hooks/useStockSocket";
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
} from "@/app/components/handlers/annotations";
import {
  useStrategyValidation,
  type CandidateBoundaryAdjustment,
  type ValidationState,
} from "./SimilaritySearch/validation";
export type {
  CandidateBoundaryAdjustment,
  ValidationCandidate,
  ValidationState,
} from "./SimilaritySearch/validation";

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
    formationPercent: number,
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
  chartLoadState: ChartLoadState;
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
  const [strategyTeaching, updateTeaching] = useState<StrategyTeachingState | null>(null);
  const [accountUnrealisedPnL, setAccountUnrealisedPnL] = useState(0);

  const interval = intervalOverride ?? localInterval;
  const isCandle = isCandleOverride ?? localIsCandle;

  const stopAnnotation = useCallback(() => {
    setCreatingStrategy(false);
    setAnnotationStrategyLabel(null);
  }, []);

  const closeStrategyTeaching = useCallback(() => {
    updateTeaching(null);
  }, []);

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
    chartLoadState,
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

  const prepareValidation = useCallback(() => {
    closeStrategyTeaching();
    stopAnnotation();
  }, [closeStrategyTeaching, stopAnnotation]);

  const {
    validation,
    startValidation,
    stopValidation,
    acceptCandidate,
    rejectCandidate,
    adjustCandidateBoundary,
  } = useStrategyValidation({
    chartData: chartData ?? [],
    loadingMore,
    loadPreviousPage,
    shortname,
    onStart: prepareValidation,
  });

  const openStrategyTeaching = useCallback((
    strategyId: string,
    snapshotIndex: number,
    snapshot: StrategySnapshot,
  ) => {
    stopValidation();
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
  }, [stopAnnotation, stopValidation]);

  const startAnnotation = useCallback((strategyLabel?: string) => {
    stopValidation();
    closeStrategyTeaching();
    setAnnotationError(null);
    setAnnotationStrategyLabel(strategyLabel ?? null);
    setCreatingStrategy(true);
  }, [closeStrategyTeaching, stopValidation]);

  const setIsCreatingStrategy = useCallback((value: boolean) => {
    if (value) startAnnotation();
    else stopAnnotation();
  }, [startAnnotation, stopAnnotation]);

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
        chartLoadState,
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
        loadingMore,
        loadPreviousPage,
      }}
    >
      {children}
    </ChartContext.Provider>
  );
}
