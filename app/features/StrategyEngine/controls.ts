import type { Candle } from "@/app/components/types/charts";
import {
  candleRangeByTime,
  resizeCandleRange,
  stepCandleRange,
} from "./candleRange";
import {
  alignCandleStructure,
  compareWindow,
} from "./similarity";
import {
  compareSemanticSnapshot,
  scoreAnnotation,
} from "./semantic";
import type {
  CandidateBoundaryAdjustment,
  SimilarityResult,
  StrategyAnnotation,
  StrategyReference,
  StrategySnapshot,
  StrategyTeachingState,
  ValidationCandidate,
  ValidationState,
} from "./types";

const MINIMUM_CANDIDATE_LENGTH = 5;

export function bestReferenceMatch(
  references: StrategyReference[],
  semanticReferences: StrategySnapshot[],
  observed: Candle[],
) {
  let best: {
    result: SimilarityResult;
    referenceIndex: number;
  } | null = null;

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
      best = {
        result,
        referenceIndex,
      };
    }
  }

  if (!best) return null;

  const structuralReference = references[best.referenceIndex];
  const semanticIndex = semanticReferences.findIndex(
    (reference) => reference.candles === structuralReference.candles,
  );
  const resolvedIndex =
    semanticIndex < 0 ? best.referenceIndex : semanticIndex;
  const semanticReference = semanticReferences[resolvedIndex];
  const semantic =
    best.result.qualified && semanticReference
      ? compareSemanticSnapshot(
          semanticReference,
          observed,
          resolvedIndex,
          best.result.scores.structure,
        )
      : null;
  const rank =
    best.result.scores.structure * 0.75 +
    (semantic?.score ?? best.result.scores.structure) * 0.25;

  return {
    ...best,
    semantic,
    rank,
  };
}

export function candidateStartIndex(
  chartData: Candle[],
  candidate: ValidationCandidate,
) {
  return chartData.findIndex(
    ({ time }) => time === candidate.candles[0]?.time,
  );
}

export function advancePastCandidate(
  current: Extract<ValidationState, { active: true }>,
  nextScanIndex: number,
) {
  const next = Math.min(current.scanIndex - 1, nextScanIndex);

  return {
    ...current,
    candidate: null,
    scanIndex: next,
    scanned:
      current.scanned +
      Math.min(
        current.scanIndex - next,
        Math.max(0, current.scanIndex - current.maxLength + 1),
      ),
  };
}

export function adjustValidationCandidate(
  current: ValidationState,
  chartData: Candle[],
  adjustment: CandidateBoundaryAdjustment,
): ValidationState {
  if (!current.active || !current.candidate || !chartData.length) {
    return current;
  }

  const candidate = current.candidate;

  if (adjustment.target === "candidate") {
    const range = candleRangeByTime(
      chartData,
      candidate.candles[0]?.time,
      candidate.candles[candidate.candles.length - 1]?.time,
    );

    if (!range) return current;

    const nextRange = stepCandleRange(
      range,
      adjustment.boundary,
      adjustment.delta,
      chartData.length,
      MINIMUM_CANDIDATE_LENGTH,
    );

    if (
      nextRange.startIndex === range.startIndex &&
      nextRange.endIndex === range.endIndex
    ) {
      return current;
    }

    const candles = chartData.slice(
      nextRange.startIndex,
      nextRange.endIndex + 1,
    );
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

  const candleIndex = Math.max(
    0,
    Math.min(last, adjustment.candleIndex),
  );

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
        semantic: {
          ...semantic,
          execution,
        },
      },
    };
  }

  const result = semantic.results.find(
    ({ id }) => id === adjustment.annotationId,
  );
  const reference =
    result && current.semanticReferences[result.referenceIndex];
  const annotation =
    reference?.annotations.find(({ id }) => id === result?.id) ??
    reference?.annotations.find(
      ({ conceptId }) => conceptId === result?.conceptId,
    );

  if (
    !result ||
    !reference ||
    !annotation ||
    annotation.kind === "marker"
  ) {
    return current;
  }

  const range = resizeCandleRange(
    {
      startIndex: result.matchedStartIndex,
      endIndex: result.matchedEndIndex,
    },
    adjustment.boundary,
    candleIndex,
    candidate.candles.length,
  );
  const alignment = alignCandleStructure(
    reference.candles,
    candidate.candles,
  );

  if (!alignment.length) return current;

  const match = scoreAnnotation(
    reference.candles,
    candidate.candles,
    annotation,
    alignment,
    {
      start: range.startIndex,
      end: range.endIndex,
    },
  );
  const results = semantic.results.map((item) =>
    item.id === adjustment.annotationId
      ? {
          ...item,
          score: match.score,
          passed:
            item.importance !== "required" ||
            match.score >= 70,
          matchedStartIndex: match.start,
          matchedEndIndex: match.end,
        }
      : item,
  );
  const totalWeight = results.reduce(
    (sum, item) =>
      sum + (item.importance === "required" ? 2 : 1),
    0,
  );
  const score = totalWeight
    ? results.reduce(
        (sum, item) =>
          sum +
          item.score *
            (item.importance === "required" ? 2 : 1),
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
        qualified: results.every(({ passed }) => passed),
      },
    },
  };
}

export function createTeachingAnnotation({
  id,
  teaching,
  candles,
  firstIndex,
  lastIndex,
  fromPrice,
  toPrice,
  markerAnchor,
}: {
  id: string;
  teaching: Pick<
    StrategyTeachingState,
    "tool" | "label" | "importance" | "trigger"
  >;
  candles: Candle[];
  firstIndex: number;
  lastIndex: number;
  fromPrice: number;
  toPrice: number;
  markerAnchor?: "open" | "high" | "low" | "close";
}): StrategyAnnotation {
  const tool = teaching.tool;
  const activeLabel =
    teaching.label.trim() || tool.replace(/_/g, " ");
  const execution = [
    "entry",
    "exit",
    "stop_loss",
    "take_profit",
  ].includes(tool);
  const base = {
    id,
    conceptId: activeLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
    label: activeLabel,
    role: (
      execution
        ? tool
        : "structure"
    ) as StrategyAnnotation["role"],
    importance: teaching.importance,
    trigger: teaching.trigger,
  };
  const startIndex = Math.max(
    0,
    Math.min(candles.length - 1, firstIndex, lastIndex),
  );
  const endIndex = Math.max(
    startIndex,
    Math.min(candles.length - 1, Math.max(firstIndex, lastIndex)),
  );

  if (tool === "candle_group") {
    return {
      ...base,
      kind: "candle_group",
      startIndex,
      endIndex,
    };
  }

  if (tool === "zone") {
    return {
      ...base,
      kind: "zone",
      startIndex,
      endIndex,
      priceHigh: Math.max(fromPrice, toPrice),
      priceLow: Math.min(fromPrice, toPrice),
    };
  }

  if (tool === "level") {
    return {
      ...base,
      kind: "level",
      startIndex: 0,
      endIndex: Math.max(0, candles.length - 1),
      price: toPrice,
    };
  }

  const candleIndex = endIndex;
  const candle = candles[candleIndex];
  const priceAnchor = markerAnchor ?? "close";

  return {
    ...base,
    kind: "marker",
    candleIndex,
    priceAnchor,
    price: candle[priceAnchor],
  };
}
