"use client";

import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChartContext } from "@/app/(pages)/chart/chartcontext";
import {
  buildAnnotationPayload,
  saveUserAnnotation,
} from "@/app/components/handlers/annotations";
import { reconcileForwardPass } from "./forward";
import { useStrategyValidation } from "./validation";
import type {
  AnnotationDraft,
  CandidateBoundaryAdjustment,
  ForwardPassState,
  StrategyAnnotation,
  StrategyChartController,
  StrategyDetails,
  StrategySnapshot,
  StrategyTeachingState,
  ValidationState,
} from "./types";

type StrategyEngineValue = {
  activeStrategy: StrategyDetails | null;
  setActiveStrategy: Dispatch<
    SetStateAction<StrategyDetails | null>
  >;
  forwardPass: ForwardPassState | null;
  isCreatingStrategy: boolean;
  annotationStrategyLabel: string | null;
  startAnnotation: (strategyLabel?: string) => void;
  stopAnnotation: () => void;
  annotations: AnnotationDraft[];
  annotationError: string | null;
  handleAnnotation: (
    annotation: AnnotationDraft,
  ) => Promise<void>;
  validation: ValidationState;
  startValidation: (
    strategyId: string,
    strategyLabel: string,
    snapshots: StrategySnapshot[],
  ) => void;
  stopValidation: () => void;
  acceptCandidate: () => Promise<void>;
  rejectCandidate: () => void;
  adjustCandidateBoundary: (
    adjustment: CandidateBoundaryAdjustment,
  ) => void;
  strategyTeaching: StrategyTeachingState | null;
  openStrategyTeaching: (
    strategyId: string,
    snapshotIndex: number,
    snapshot: StrategySnapshot,
  ) => void;
  closeStrategyTeaching: () => void;
  setStrategyTeaching: (
    patch: Partial<
      Pick<
        StrategyTeachingState,
        "tool" | "label" | "importance" | "trigger"
      >
    >,
  ) => void;
  setStrategyTeachingAnnotations: (
    annotations: StrategyAnnotation[],
  ) => void;
  chartController: StrategyChartController;
};

const StrategyEngineContext =
  createContext<StrategyEngineValue | null>(null);

export function useStrategyEngine() {
  const context = useContext(StrategyEngineContext);

  if (!context) {
    throw new Error(
      "useStrategyEngine must be used inside StrategyEngineProvider",
    );
  }

  return context;
}

export function StrategyEngineProvider({
  children,
}: {
  children: ReactNode;
}) {
  const {
    chartData,
    loadingMore,
    loadPreviousPage,
    shortname,
  } = useChartContext();
  const [
    isCreatingStrategy,
    setIsCreatingStrategy,
  ] = useState(false);
  const [
    annotationStrategyLabel,
    setAnnotationStrategyLabel,
  ] = useState<string | null>(null);
  const [annotations, setAnnotations] =
    useState<AnnotationDraft[]>([]);
  const [annotationError, setAnnotationError] =
    useState<string | null>(null);
  const [activeStrategy, setActiveStrategy] =
    useState<StrategyDetails | null>(null);
  const [forwardPass, setForwardPass] =
    useState<ForwardPassState | null>(null);
  const forwardPassRef =
    useRef<ForwardPassState | null>(null);
  const strategyRef =
    useRef<StrategyDetails | null>(null);
  const seriesStartRef =
    useRef<number | null>(null);
  const [
    strategyTeaching,
    updateStrategyTeaching,
  ] = useState<StrategyTeachingState | null>(null);

  useEffect(() => {
    const observedCandles = chartData.slice(0, -1);

    if (!activeStrategy || !observedCandles.length) {
      forwardPassRef.current = null;
      strategyRef.current = activeStrategy;
      seriesStartRef.current = null;
      setForwardPass(null);
      return;
    }

    const seriesStart = observedCandles[0].time;
    const canContinue =
      strategyRef.current === activeStrategy &&
      seriesStartRef.current === seriesStart;
    const next = reconcileForwardPass(
      canContinue ? forwardPassRef.current : null,
      observedCandles,
      activeStrategy.snapshots,
      activeStrategy.id,
    );

    strategyRef.current = activeStrategy;
    seriesStartRef.current = seriesStart;
    forwardPassRef.current = next;
    setForwardPass(next);
  }, [
    activeStrategy,
    chartData,
  ]);

  const stopAnnotation = useCallback(() => {
    setIsCreatingStrategy(false);
    setAnnotationStrategyLabel(null);
  }, []);

  const closeStrategyTeaching = useCallback(() => {
    updateStrategyTeaching(null);
  }, []);

  const prepareValidation = useCallback(() => {
    stopAnnotation();
    closeStrategyTeaching();
  }, [
    closeStrategyTeaching,
    stopAnnotation,
  ]);

  const {
    validation,
    startValidation,
    stopValidation,
    acceptCandidate,
    rejectCandidate,
    adjustCandidateBoundary,
  } = useStrategyValidation({
    chartData,
    loadingMore,
    loadPreviousPage,
    shortname,
    onStart: prepareValidation,
  });

  const startAnnotation = useCallback(
    (strategyLabel?: string) => {
      stopValidation();
      closeStrategyTeaching();
      setAnnotationError(null);
      setAnnotationStrategyLabel(strategyLabel ?? null);
      setIsCreatingStrategy(true);
    },
    [
      closeStrategyTeaching,
      stopValidation,
    ],
  );

  const openStrategyTeaching = useCallback(
    (
      strategyId: string,
      snapshotIndex: number,
      snapshot: StrategySnapshot,
    ) => {
      stopValidation();
      stopAnnotation();

      updateStrategyTeaching({
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
    [
      stopAnnotation,
      stopValidation,
    ],
  );

  const setStrategyTeaching = useCallback(
    (
      patch: Partial<
        Pick<
          StrategyTeachingState,
          "tool" | "label" | "importance" | "trigger"
        >
      >,
    ) => {
      updateStrategyTeaching((current) =>
        current
          ? {
              ...current,
              ...patch,
            }
          : current,
      );
    },
    [],
  );

  const setStrategyTeachingAnnotations = useCallback(
    (nextAnnotations: StrategyAnnotation[]) => {
      updateStrategyTeaching((current) =>
        current
          ? {
              ...current,
              annotations: nextAnnotations,
            }
          : current,
      );
    },
    [],
  );

  const handleAnnotation = useCallback(
    async (annotation: AnnotationDraft) => {
      stopAnnotation();
      setAnnotationError(null);

      try {
        if (
          !annotation.candles ||
          annotation.candles.length < 5
        ) {
          throw new Error(
            "Select at least five candles for a strategy snapshot.",
          );
        }

        await saveUserAnnotation(
          buildAnnotationPayload(annotation, shortname),
        );
        setAnnotations((current) => [
          ...current,
          annotation,
        ]);
      } catch (cause) {
        setAnnotationError(
          cause instanceof Error
            ? cause.message
            : "Failed to save strategy snapshot",
        );
      }
    },
    [
      shortname,
      stopAnnotation,
    ],
  );

  const chartController = useMemo<StrategyChartController>(
    () => ({
      isCreatingStrategy,
      annotationStrategyLabel,
      handleAnnotation,
      validation,
      strategyTeaching,
      adjustCandidateBoundary,
      setStrategyTeachingAnnotations,
    }),
    [
      adjustCandidateBoundary,
      annotationStrategyLabel,
      handleAnnotation,
      isCreatingStrategy,
      setStrategyTeachingAnnotations,
      strategyTeaching,
      validation,
    ],
  );

  const value = useMemo<StrategyEngineValue>(
    () => ({
      activeStrategy,
      setActiveStrategy,
      forwardPass,
      isCreatingStrategy,
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
      chartController,
    }),
    [
      acceptCandidate,
      activeStrategy,
      adjustCandidateBoundary,
      annotationError,
      annotationStrategyLabel,
      annotations,
      chartController,
      closeStrategyTeaching,
      handleAnnotation,
      isCreatingStrategy,
      forwardPass,
      openStrategyTeaching,
      rejectCandidate,
      setStrategyTeaching,
      setStrategyTeachingAnnotations,
      startAnnotation,
      startValidation,
      stopAnnotation,
      stopValidation,
      strategyTeaching,
      validation,
    ],
  );

  return (
    <StrategyEngineContext.Provider value={value}>
      {children}
    </StrategyEngineContext.Provider>
  );
}
