import {
  useCallback,
  useRef,
  useState,
} from "react";
import type { Candle } from "@/app/components/types/charts";
import {
  adjustValidationCandidate,
  advancePastCandidate,
  candidateStartIndex,
} from "./controls";
import { useValidationLookback } from "./lookback";
import { saveValidationCandidate } from "./persistence";
import type {
  CandidateBoundaryAdjustment,
  StrategySnapshot,
  ValidationState,
} from "./types";

export function useStrategyValidation({
  chartData,
  loadingMore,
  loadPreviousPage,
  shortname,
  onStart,
}: {
  chartData: Candle[];
  loadingMore: boolean;
  loadPreviousPage: () => void;
  shortname: string;
  onStart: () => void;
}) {
  const [validation, setValidation] =
    useState<ValidationState>({
      active: false,
    });
  const scanningRef = useRef(false);

  useValidationLookback({
    validation,
    setValidation,
    chartData,
    loadingMore,
    loadPreviousPage,
    scanningRef,
  });

  const startValidation = useCallback(
    (
      strategyId: string,
      strategyLabel: string,
      snapshots: StrategySnapshot[],
    ) => {
      if (!chartData.length || snapshots.length === 0) {
        return;
      }

      onStart();

      const aggregate = snapshots.length >= 4;
      const semanticReferences = snapshots;
      const source = aggregate
        ? snapshots
        : snapshots.slice(-1);
      const references = source.map(
        ({
          candles,
          annotations,
        }) => ({
          candles,
          annotations,
        }),
      );
      const referenceLengths = references.map(
        ({ candles }) => candles.length,
      );
      const latestLength =
        references[references.length - 1].candles.length;
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
        available: Math.max(
          0,
          chartData.length - maxLength,
        ),
        historyRequest: null,
        candidate: null,
        done: false,
      });
    },
    [
      chartData,
      onStart,
    ],
  );

  const stopValidation = useCallback(() => {
    setValidation({
      active: false,
    });
    scanningRef.current = false;
  }, []);

  const acceptCandidate = useCallback(async () => {
    if (!validation.active || !validation.candidate) {
      return;
    }

    const startIndex = candidateStartIndex(
      chartData,
      validation.candidate,
    );

    if (startIndex < 0) return;

    await saveValidationCandidate(validation, shortname);

    setValidation((current) =>
      current.active
        ? advancePastCandidate(current, startIndex - 1)
        : current,
    );
  }, [
    chartData,
    shortname,
    validation,
  ]);

  const rejectCandidate = useCallback(() => {
    if (!validation.active || !validation.candidate) {
      return;
    }

    const startIndex = candidateStartIndex(
      chartData,
      validation.candidate,
    );

    if (startIndex < 0) return;

    setValidation((current) =>
      current.active
        ? advancePastCandidate(current, startIndex - 1)
        : current,
    );
  }, [
    chartData,
    validation,
  ]);

  const adjustCandidateBoundary = useCallback(
    (adjustment: CandidateBoundaryAdjustment) => {
      setValidation((current) =>
        adjustValidationCandidate(
          current,
          chartData,
          adjustment,
        ),
      );
    },
    [chartData],
  );

  return {
    validation,
    startValidation,
    stopValidation,
    acceptCandidate,
    rejectCandidate,
    adjustCandidateBoundary,
  };
}
