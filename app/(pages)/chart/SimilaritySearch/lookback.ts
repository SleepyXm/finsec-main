import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useEffect,
} from "react";
import type { StrategySnapshot } from "@/app/components/handlers/annotations";
import type { Candle } from "@/app/components/types/charts";
import { runForwardPass } from "./forwardpass";
import type { FormationAssessment, ValidationState } from "./validation";

type FormationMetricScorer = (
  references: StrategySnapshot[],
  candles: Candle[],
  formationPercent: number,
) => FormationAssessment;

function scheduleValidation(
  setValidation: Dispatch<SetStateAction<ValidationState>>,
  update: (current: ValidationState) => ValidationState,
) {
  queueMicrotask(() => setValidation(update));
}

export function useValidationLookback({
  validation,
  setValidation,
  chartData,
  loadingMore,
  loadPreviousPage,
  scanningRef,
  scoreFormation,
}: {
  validation: ValidationState;
  setValidation: Dispatch<SetStateAction<ValidationState>>;
  chartData: Candle[];
  loadingMore: boolean;
  loadPreviousPage: () => void;
  scanningRef: MutableRefObject<boolean>;
  scoreFormation: FormationMetricScorer;
}) {
  useEffect(() => {
    if (
      !validation.active || validation.done || validation.candidate ||
      scanningRef.current
    ) return;

    const { scanIndex, historyRequest } = validation;
    if (historyRequest) {
      if (loadingMore) return;
      if (!historyRequest.settled) {
        scheduleValidation(setValidation, (current) =>
          current.active && current.historyRequest
            ? { ...current, historyRequest: { ...current.historyRequest, settled: true } }
            : current,
        );
        return;
      }

      const prepended = chartData.findIndex(
        ({ time }) => time >= historyRequest.oldestTime,
      );
      scheduleValidation(setValidation, (current) => {
        if (!current.active) return current;
        return prepended > 0
          ? {
              ...current,
              scanIndex: prepended - 1,
              available: current.available + prepended,
              historyRequest: null,
            }
          : { ...current, historyRequest: null, done: true };
      });
      return;
    }

    if (scanIndex < 0) {
      const oldestTime = chartData[0]?.time;
      if (oldestTime == null) {
        scheduleValidation(setValidation, (current) =>
          current.active ? { ...current, done: true } : current,
        );
        return;
      }

      loadPreviousPage();
      scheduleValidation(setValidation, (current) =>
        current.active
          ? { ...current, historyRequest: { oldestTime, settled: false } }
          : current,
      );
      return;
    }

    scanningRef.current = true;
    setTimeout(() => {
      const candidate = runForwardPass({
        chartData,
        startIndex: scanIndex,
        maxLength: validation.maxFormationLength,
        score: (candles) => scoreFormation(
          validation.snapshots,
          candles,
          validation.formationPercent,
        ),
      });

      setValidation((current) => {
        if (!current.active) return current;
        return candidate
          ? { ...current, candidate }
          : {
              ...current,
              scanIndex: current.scanIndex - 1,
              scanned: current.scanned + 1,
            };
      });
      scanningRef.current = false;
    }, 0);
  }, [
    validation,
    chartData,
    loadingMore,
    loadPreviousPage,
    scanningRef,
    scoreFormation,
    setValidation,
  ]);
}
