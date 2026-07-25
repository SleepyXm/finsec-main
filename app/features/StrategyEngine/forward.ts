import type { Candle } from "@/app/components/types/charts";
import { compareSemanticSnapshot } from "./semantic";
import { compareWindow } from "./similarity";
import type {
  ForwardFormation,
  ForwardPassState,
  ForwardReferenceMatch,
  SemanticValidation,
  SimilarityResult,
  StrategyAnnotation,
  StrategySnapshot,
} from "./types";
import { buildValidationMarks } from "./validationMarks";

const MINIMUM_FORMATION_CANDLES = 5;
const LENGTH_GATE = 0.7;
const MAX_LOOKBACK_CANDLES = 200;
const FAILURE_MATURITY_RATIO = 0.25;

type EvaluatedReference = {
  match: ForwardReferenceMatch;
  prefix: StrategySnapshot;
  result: SimilarityResult;
  semantic: SemanticValidation | null;
};

export function createForwardPassState(
  strategyId: string,
  processedCandles = 0,
): ForwardPassState {
  return {
    strategyId,
    processedCandles,
    status: "searching",
    formation: null,
    historicalFormations: [],
    searchFromIndex: 0,
  };
}

function evaluateSnapshot(
  snapshot: StrategySnapshot,
  referenceIndex: number,
  candidate: Candle[],
): EvaluatedReference | null {
  const prefixLength = Math.min(snapshot.candles.length, candidate.length);

  if (prefixLength < MINIMUM_FORMATION_CANDLES) return null;

  const prefixEndIndex = prefixLength - 1;
  const prefix: StrategySnapshot = {
    ...snapshot,
    candles: snapshot.candles.slice(0, prefixLength),
    annotations: snapshot.annotations.flatMap(
      (annotation): StrategyAnnotation[] => {
        if (annotation.kind === "marker") {
          return annotation.candleIndex <= prefixEndIndex ? [annotation] : [];
        }

        if (annotation.startIndex > prefixEndIndex) return [];

        return [{
          ...annotation,
          endIndex: Math.min(annotation.endIndex, prefixEndIndex),
        }];
      },
    ),
  };

  const result = compareWindow(prefix.candles, candidate);
  const semantic = result.qualified
    ? compareSemanticSnapshot(prefix, candidate, 0, result.scores.structure)
    : null;

  const qualified = result.qualified && (semantic?.qualified ?? true);
  const confidence =
    result.scores.structure * 0.75 +
    (semantic?.score ?? result.scores.structure) * 0.25;

  return {
    prefix,
    result,
    semantic,
    match: {
      referenceIndex,
      prefixEndIndex,
      progress: prefixLength / Math.max(1, snapshot.candles.length),
      confidence,
      structure: result.scores.structure,
      qualified,
    },
  };
}

function evaluateCandidate(
  candles: Candle[],
  snapshots: StrategySnapshot[],
  startIndex: number,
  endIndex: number,
): ForwardFormation | null {
  const candidate = candles.slice(startIndex, endIndex + 1);

  if (candidate.length < MINIMUM_FORMATION_CANDLES || !snapshots.length) {
    return null;
  }

  const evaluated = snapshots.flatMap(
    (snapshot, referenceIndex): EvaluatedReference[] => {
      const reference = evaluateSnapshot(snapshot, referenceIndex, candidate);
      return reference ? [reference] : [];
    },
  );

  const supporting = evaluated.filter(({ match }) => match.qualified);
  const requiredSupport = Math.floor(snapshots.length / 2) + 1;

  if (!supporting.length) return null;

  const confidence =
    supporting.reduce((sum, { match }) => sum + match.confidence, 0) /
    supporting.length;

  const progress =
    supporting.reduce((sum, { match }) => sum + match.progress, 0) /
    supporting.length;

  const representative = supporting.reduce(
    (best, current) =>
      current.match.confidence > best.match.confidence ? current : best,
  );

  const confirmed =
    supporting.filter(({ match }) => match.progress >= 1).length >=
    requiredSupport;

  const marks = representative.semantic
    ? buildValidationMarks(
        {
          candles: candidate,
          result: representative.result,
          semantic: representative.semantic,
          referenceIndex: 0,
        },
        [representative.prefix],
      ).map((mark) => {
        switch (mark.annotation.kind) {
          case "marker":
            return {
              ...mark,
              annotation: {
                ...mark.annotation,
                candleIndex: mark.annotation.candleIndex + startIndex,
              },
            };

          default:
            return {
              ...mark,
              annotation: {
                ...mark.annotation,
                startIndex: mark.annotation.startIndex + startIndex,
                endIndex: mark.annotation.endIndex + startIndex,
              },
            };
        }
      })
    : [];

  return {
    startIndex,
    endIndex,
    status: confirmed ? "confirmed" : "forming",
    confidence,
    support: supporting.length,
    totalReferences: snapshots.length,
    progress,
    referenceMatches: evaluated.map(({ match }) => match),
    marks,
  };
}

function addHistoricalFormation(
  history: ForwardFormation[],
  formation: ForwardFormation,
): ForwardFormation[] {
  const exists = history.some(
    (item) =>
      item.startIndex === formation.startIndex &&
      item.endIndex === formation.endIndex &&
      item.status === formation.status,
  );

  return exists ? history : [...history, formation];
}

function findFormation(
  candles: Candle[],
  snapshots: StrategySnapshot[],
  endIndex: number,
  minimumStartIndex = 0,
): ForwardFormation | null {
  const longestReference = snapshots.reduce(
    (length, snapshot) => Math.max(length, snapshot.candles.length),
    0,
  );

  const maximumCandidateLength = Math.floor(longestReference / LENGTH_GATE);
  const searchLength = Math.min(
    MAX_LOOKBACK_CANDLES,
    maximumCandidateLength,
  );

  const firstStart = Math.max(
    minimumStartIndex,
    0,
    endIndex - searchLength + 1,
  );

  const lastStart = endIndex - MINIMUM_FORMATION_CANDLES + 1;

  if (lastStart < firstStart) return null;

  let best: ForwardFormation | null = null;

  for (
    let startIndex = lastStart;
    startIndex >= firstStart;
    startIndex -= 1
  ) {
    const candidate = evaluateCandidate(
      candles,
      snapshots,
      startIndex,
      endIndex,
    );

    if (!candidate) continue;

    if (
      !best ||
      candidate.support > best.support ||
      (
        candidate.support === best.support &&
        candidate.status === "confirmed" &&
        best.status !== "confirmed"
      ) ||
      (
        candidate.support === best.support &&
        candidate.status === best.status &&
        candidate.confidence > best.confidence
      ) ||
      (
        candidate.support === best.support &&
        candidate.status === best.status &&
        candidate.confidence === best.confidence &&
        candidate.progress > best.progress
      )
    ) {
      best = candidate;
    }
  }

  return best;
}

function advanceForwardPass(
  current: ForwardPassState,
  observedCandles: Candle[],
  snapshots: StrategySnapshot[],
  failureMaturity: number,
): ForwardPassState {
  const endIndex = observedCandles.length - 1;
  const processedCandles = observedCandles.length;

  if (endIndex < current.processedCandles) return current;

  switch (current.status) {
    case "forming": {
      if (!current.formation) {
        return {
          ...current,
          processedCandles,
          status: "invalidated",
        };
      }

      const formation = evaluateCandidate(
        observedCandles,
        snapshots,
        current.formation.startIndex,
        endIndex,
      );

      if (formation) {
        return {
          ...current,
          processedCandles,
          status: formation.status,
          formation,
          historicalFormations:
            formation.status === "confirmed"
              ? addHistoricalFormation(
                  current.historicalFormations,
                  formation,
                )
              : current.historicalFormations,
        };
      }

      const candidateLength =
        endIndex - current.formation.startIndex + 1;

      if (candidateLength < failureMaturity) {
        return {
          ...current,
          processedCandles,
          formation: { ...current.formation, endIndex },
        };
      }

      const invalidated: ForwardFormation = {
        ...current.formation,
        endIndex,
        status: "invalidated",
      };

      return {
        ...current,
        processedCandles,
        status: "invalidated",
        formation: invalidated,
        historicalFormations: addHistoricalFormation(
          current.historicalFormations,
          invalidated,
        ),
      };
    }

    case "searching": {
      const formation = findFormation(
        observedCandles,
        snapshots,
        endIndex,
      );

      if (!formation) {
        return {
          ...current,
          processedCandles,
          formation: null,
        };
      }

      return {
        ...current,
        processedCandles,
        status: formation.status,
        formation,
        historicalFormations:
          formation.status === "confirmed"
            ? addHistoricalFormation(
                current.historicalFormations,
                formation,
              )
            : current.historicalFormations,
      };
    }

    case "confirmed":
    case "invalidated": {
      const minimumStartIndex = current.formation
        ? current.formation.endIndex +
          Number(current.status === "confirmed")
        : 0;

      const formation = findFormation(
        observedCandles,
        snapshots,
        endIndex,
        minimumStartIndex,
      );

      if (!formation) {
        return { ...current, processedCandles };
      }

      return {
        ...current,
        processedCandles,
        status: formation.status,
        formation,
        historicalFormations:
          formation.status === "confirmed"
            ? addHistoricalFormation(
                current.historicalFormations,
                formation,
              )
            : current.historicalFormations,
      };
    }
  }
}

export function reconcileForwardPass(
  current: ForwardPassState | null,
  observedCandles: Candle[],
  snapshots: StrategySnapshot[],
  strategyId: string,
): ForwardPassState {
  if (!snapshots.length) {
    return createForwardPassState(
      strategyId,
      observedCandles.length,
    );
  }

  const lengths = snapshots
    .map((snapshot) => snapshot.candles.length)
    .sort((left, right) => left - right);

  const middle = Math.floor(lengths.length / 2);
  const medianLength =
    lengths.length % 2
      ? lengths[middle]
      : (lengths[middle - 1] + lengths[middle]) / 2;

  const failureMaturity = Math.max(
    MINIMUM_FORMATION_CANDLES,
    Math.ceil(medianLength * FAILURE_MATURITY_RATIO),
  );

  const longestReference = lengths[lengths.length - 1];
  const snapshotLookback =
    Math.floor(longestReference / LENGTH_GATE) +
    MINIMUM_FORMATION_CANDLES;

  const initialLookback = Math.min(
    MAX_LOOKBACK_CANDLES,
    snapshotLookback,
  );

  let next =
    current &&
    current.strategyId === strategyId &&
    current.processedCandles <= observedCandles.length
      ? current
      : createForwardPassState(
          strategyId,
          Math.max(0, observedCandles.length - initialLookback),
        );

  while (next.processedCandles < observedCandles.length) {
    next = advanceForwardPass(
      next,
      observedCandles.slice(
        0,
        next.processedCandles + 1,
      ),
      snapshots,
      failureMaturity,
    );
  }

  return next;
}