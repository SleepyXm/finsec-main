import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
} from "react";
import type { Candle } from "@/app/components/types/charts";
import { bestReferenceMatch } from "./controls";
import type {
  ValidationCandidate,
  ValidationState,
} from "./types";

const MAX_LENGTH_BOUNDARY_RATIO = 0.95;

export function useValidationLookback({
  validation,
  setValidation,
  chartData,
  loadingMore,
  loadPreviousPage,
  scanningRef,
}: {
  validation: ValidationState;
  setValidation: Dispatch<SetStateAction<ValidationState>>;
  chartData: Candle[];
  loadingMore: boolean;
  loadPreviousPage: () => void;
  scanningRef: MutableRefObject<boolean>;
}) {
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

    if (historyRequest) {
      if (loadingMore) return;

      if (!historyRequest.settled) {
        setValidation((current) =>
          current.active && current.historyRequest
            ? {
                ...current,
                historyRequest: {
                  ...current.historyRequest,
                  settled: true,
                },
              }
            : current,
        );

        return;
      }

      const prependedCount = chartData.findIndex(
        (candle) => candle.time >= historyRequest.oldestTime,
      );

      if (prependedCount > 0) {
        setValidation((current) =>
          current.active
            ? {
                ...current,
                scanIndex:
                  current.scanIndex + prependedCount,
                available:
                  current.available + prependedCount,
                historyRequest: null,
              }
            : current,
        );
      } else {
        setValidation((current) =>
          current.active
            ? {
                ...current,
                historyRequest: null,
                done: true,
              }
            : current,
        );
      }

      return;
    }

    if (scanIndex - maxLength < 0) {
      const oldestTime = chartData[0]?.time;

      if (oldestTime == null) {
        setValidation((current) =>
          current.active
            ? {
                ...current,
                done: true,
              }
            : current,
        );

        return;
      }

      loadPreviousPage();

      setValidation((current) =>
        current.active
          ? {
              ...current,
              historyRequest: {
                oldestTime,
                settled: false,
              },
            }
          : current,
      );

      return;
    }

    scanningRef.current = true;

    setTimeout(() => {
      let bestCandidate: ValidationCandidate | null = null;
      let bestRank = Number.NEGATIVE_INFINITY;

      for (
        let length = minLength;
        length <= Math.min(maxLength, scanIndex + 1);
        length += 1
      ) {
        const start = scanIndex - length + 1;

        if (start < 0) break;

        const window = chartData.slice(start, scanIndex + 1);
        const match = bestReferenceMatch(
          references,
          semanticReferences,
          window,
        );

        if (
          match?.result.qualified &&
          match.rank > bestRank
        ) {
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
        bestCandidate.candles.length / maxLength >=
          MAX_LENGTH_BOUNDARY_RATIO;

      if (bestCandidate && !lengthBoundaryReached) {
        setValidation((current) =>
          current.active
            ? {
                ...current,
                candidate: bestCandidate,
              }
            : current,
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
  }, [
    chartData,
    loadPreviousPage,
    loadingMore,
    scanningRef,
    setValidation,
    validation,
  ]);
}
