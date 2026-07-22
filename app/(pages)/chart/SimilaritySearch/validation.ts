import { useCallback, useRef, useState } from "react";
import type { StrategySnapshot } from "@/app/components/handlers/annotations";
import type { Candle } from "@/app/components/types/charts";
import { useValidationLookback } from "./lookback";
import { saveValidationCandidate } from "./persistence";
import { alignCandleStructure, compareWindow } from "./similarity";
import {
  compareSemanticSnapshots,
  scoreAnnotation,
  type SemanticValidation,
} from "./semantic";

export type FormationScores = {
  structure: number;
  magnitude: number;
  coverage: number;
  consensus: number;
};

export type FormationResult = {
  state: "forming" | "complete";
  scores: FormationScores;
  supportCount: number;
  referenceCount: number;
  requiredSupport: number;
  rank: number;
};

export type ValidationCandidate = {
  candles: Candle[];
  result: FormationResult;
  semantic: SemanticValidation | null;
  referenceIndex: number;
};

export type FormationAssessment =
  | { state: "invalid" | "viable" }
  | {
      state: "forming" | "complete";
      result: FormationResult;
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

type ActiveValidation = Extract<ValidationState, { active: true }>;

export type ValidationState =
  | { active: false }
  | {
      active: true;
      strategyId: string;
      strategyLabel: string;
      snapshots: StrategySnapshot[];
      formationPercent: number;
      minFormationLength: number;
      maxFormationLength: number;
      scanIndex: number;
      scanned: number;
      available: number;
      historyRequest: { oldestTime: number; settled: boolean } | null;
      candidate: ValidationCandidate | null;
      done: boolean;
    };

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

export function scoreFormationWindow(
  snapshots: StrategySnapshot[],
  observed: Candle[],
  requestedPercent: number,
): FormationAssessment {
  if (!snapshots.length || !observed.length) return { state: "invalid" };
  const formationPercent = Math.max(1, Math.min(100, requestedPercent));
  const requiredSupport = 1;
  const matches = snapshots.flatMap((snapshot, referenceIndex) => {
    if (!snapshot.candles.length) return [];
    const prefixLength = Math.min(snapshot.candles.length, observed.length);
    const result = compareWindow(snapshot.candles.slice(0, prefixLength), observed);
    if (!result.qualified) return [];
    return [{
      referenceIndex,
      prefixLength,
      coverage: Math.min(100, observed.length / snapshot.candles.length * 100),
      result,
    }];
  });

  if (matches.length < requiredSupport) return { state: "invalid" };
  const semantic = compareSemanticSnapshots(
    snapshots,
    observed,
    matches.map(({ result }) => result.scores.structure),
  );
  if (semantic && !semantic.qualified) return { state: "invalid" };

  const formed = matches.filter(({ coverage }) => coverage >= formationPercent);
  if (formed.length < requiredSupport) return { state: "viable" };

  const primary = formed.reduce((best, match) => {
    const rank = match.result.scores.structure * 0.7 + match.result.scores.size * 0.3;
    const bestRank = best.result.scores.structure * 0.7 + best.result.scores.size * 0.3;
    return rank > bestRank ? match : best;
  });
  const scores: FormationScores = {
    structure: average(formed.map(({ result }) => result.scores.structure)),
    magnitude: average(formed.map(({ result }) => result.scores.size)),
    coverage: average(formed.map(({ coverage }) => coverage)),
    consensus: formed.length / snapshots.length * 100,
  };
  const state = formed.filter(({ coverage }) => coverage >= 100).length >= requiredSupport
    ? "complete" as const
    : "forming" as const;
  const result: FormationResult = {
    state,
    scores,
    supportCount: formed.length,
    referenceCount: snapshots.length,
    requiredSupport,
    rank: scores.structure * 0.5 + scores.magnitude * 0.2 +
      scores.consensus * 0.2 + scores.coverage * 0.1,
  };

  return {
    state,
    result,
    semantic,
    referenceIndex: primary.referenceIndex,
  };
}

function candidateStartIndex(data: Candle[], candidate: ValidationCandidate) {
  return data.findIndex(({ time }) => time === candidate.candles[0].time);
}

function advancePastCandidate(current: ActiveValidation, nextScanIndex: number) {
  const next = Math.min(current.scanIndex - 1, nextScanIndex);
  return {
    ...current,
    candidate: null,
    scanIndex: next,
    scanned: current.scanned + current.scanIndex - next,
  };
}

function adjustValidationCandidate(
  current: ValidationState,
  chartData: Candle[],
  adjustment: CandidateBoundaryAdjustment,
): ValidationState {
  if (!current.active || !current.candidate || !chartData.length) return current;
  const candidate = current.candidate;

  if (adjustment.target === "candidate") {
    const startIndex = candidateStartIndex(chartData, candidate);
    const endIndex = chartData.findIndex(
      ({ time }) => time === candidate.candles[candidate.candles.length - 1].time,
    );
    if (startIndex < 0 || endIndex < 0) return current;
    const nextStart = adjustment.boundary === "start"
      ? Math.max(0, Math.min(startIndex + adjustment.delta, endIndex))
      : startIndex;
    const nextEnd = adjustment.boundary === "end"
      ? Math.min(chartData.length - 1, Math.max(endIndex + adjustment.delta, startIndex))
      : endIndex;
    const candles = chartData.slice(nextStart, nextEnd + 1);
    const assessment = scoreFormationWindow(
      current.snapshots,
      candles,
      current.formationPercent,
    );
    return assessment.state === "forming" || assessment.state === "complete"
      ? {
          ...current,
          candidate: {
            candles,
            result: assessment.result,
            semantic: assessment.semantic,
            referenceIndex: assessment.referenceIndex,
          },
        }
      : current;
  }

  if (!candidate.semantic) return current;
  const semantic = candidate.semantic;
  const last = candidate.candles.length - 1;
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
    return { ...current, candidate: { ...candidate, semantic: { ...semantic, execution } } };
  }

  const result = semantic.results.find(({ id }) => id === adjustment.annotationId);
  const reference = result && current.snapshots[result.referenceIndex];
  const annotation = reference?.annotations.find(({ id }) => id === result?.id) ??
    reference?.annotations.find(({ conceptId }) => conceptId === result?.conceptId);
  if (!result || !reference || !annotation || annotation.kind !== "candle_group") return current;
  const start = adjustment.boundary === "start"
    ? Math.min(candleIndex, result.matchedEndIndex)
    : result.matchedStartIndex;
  const end = adjustment.boundary === "end"
    ? Math.max(candleIndex, result.matchedStartIndex)
    : result.matchedEndIndex;
  const prefix = reference.candles.slice(
    0,
    Math.min(reference.candles.length, candidate.candles.length),
  );
  const located = reference.candles.findIndex((_, index) =>
    index + annotation.candles.length <= reference.candles.length &&
    annotation.candles.every((candle, offset) => {
      const source = reference.candles[index + offset];
      return source.open === candle.open && source.high === candle.high &&
        source.low === candle.low && source.close === candle.close;
    }),
  );
  const visibleAnnotation = located < 0
    ? annotation
    : {
        ...annotation,
        candles: annotation.candles.slice(
          0,
          Math.max(1, candidate.candles.length - located),
        ),
      };
  const alignment = alignCandleStructure(prefix, candidate.candles);
  if (!alignment.length) return current;
  const match = scoreAnnotation(
    prefix,
    candidate.candles,
    visibleAnnotation,
    alignment,
    { start, end },
  );
  const results = semantic.results.map((item) =>
    item.id === adjustment.annotationId
      ? {
          ...item,
          score: match.score,
          passed: item.importance !== "required" || match.score >= 70,
          matchedStartIndex: match.start,
          matchedEndIndex: match.end,
        }
      : item,
  );
  const weight = (importance: typeof results[number]["importance"]) =>
    importance === "required" ? 2 : 1;
  const totalWeight = results.reduce((sum, item) => sum + weight(item.importance), 0);
  const score = totalWeight
    ? results.reduce(
        (sum, item) => sum + item.score * weight(item.importance),
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
  const [validation, setValidation] = useState<ValidationState>({ active: false });
  const scanningRef = useRef(false);
  useValidationLookback({
    validation,
    setValidation,
    chartData,
    loadingMore,
    loadPreviousPage,
    scanningRef,
    scoreFormation: scoreFormationWindow,
  });

  const startValidation = useCallback((
    strategyId: string,
    strategyLabel: string,
    snapshots: StrategySnapshot[],
    requestedPercent: number,
  ) => {
    const references = snapshots.filter(({ candles }) => candles.length);
    if (!chartData.length || !references.length) return;
    onStart();
    const formationPercent = Math.max(1, Math.min(100, requestedPercent));
    const requiredLengths = references
      .map(({ candles }) => Math.max(1, Math.ceil(candles.length * formationPercent / 100)))
      .sort((left, right) => left - right);
    const minFormationLength = requiredLengths[0];
    const maxFormationLength = Math.max(...references.map(({ candles }) => candles.length));
    const scanIndex = chartData.length - minFormationLength;
    setValidation({
      active: true,
      strategyId,
      strategyLabel,
      snapshots: references,
      formationPercent,
      minFormationLength,
      maxFormationLength,
      scanIndex,
      scanned: 0,
      available: Math.max(0, scanIndex + 1),
      historyRequest: null,
      candidate: null,
      done: false,
    });
  }, [chartData, onStart]);

  const stopValidation = useCallback(() => {
    setValidation({ active: false });
    scanningRef.current = false;
  }, []);
  const acceptCandidate = useCallback(async () => {
    if (!validation.active || !validation.candidate) return;
    const startIndex = candidateStartIndex(chartData, validation.candidate);
    if (startIndex < 0) return;
    await saveValidationCandidate(validation, shortname);
    setValidation((current) => current.active
      ? advancePastCandidate(current, startIndex - 1)
      : current);
  }, [validation, chartData, shortname]);
  const rejectCandidate = useCallback(() => {
    if (!validation.active || !validation.candidate) return;
    const startIndex = candidateStartIndex(chartData, validation.candidate);
    if (startIndex < 0) return;
    setValidation((current) => current.active
      ? advancePastCandidate(current, startIndex - 1)
      : current);
  }, [validation, chartData]);
  const adjustCandidateBoundary = useCallback(
    (adjustment: CandidateBoundaryAdjustment) =>
      setValidation((current) =>
        adjustValidationCandidate(current, chartData, adjustment)),
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
