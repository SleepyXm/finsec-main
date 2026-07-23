import type { Candle } from "@/app/components/types/charts";
import { alignCandleStructure, normaliseCandles } from "./similarity";
import type {
  SemanticPlacement,
  SemanticResult,
  SemanticValidation,
  StrategyAnnotation,
  StrategySnapshot,
} from "./types";

export type {
  SemanticPlacement,
  SemanticResult,
  SemanticValidation,
} from "./types";

const GATE = 70;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

function bounds(reference: Candle[], annotation: StrategyAnnotation) {
  const last = Math.max(0, reference.length - 1);

  if (annotation.kind === "marker") {
    const index = Math.max(0, Math.min(last, annotation.candleIndex));
    return { start: index, end: index };
  }

  const start = Math.max(
    0,
    Math.min(last, Math.min(annotation.startIndex, annotation.endIndex)),
  );
  const end = Math.max(
    start,
    Math.min(last, Math.max(annotation.startIndex, annotation.endIndex)),
  );

  return { start, end };
}

function mappedBounds(
  reference: Candle[],
  candidateLength: number,
  annotation: StrategyAnnotation,
  alignment: number[],
) {
  const source = bounds(reference, annotation);

  const fallback = (index: number) =>
    Math.round((index * (candidateLength - 1)) / Math.max(1, reference.length - 1));

  const start = alignment[source.start] ?? fallback(source.start);
  const end = alignment[source.end] ?? fallback(source.end);

  return {
    source,
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function shape(candles: Array<Pick<Candle, "open" | "high" | "low" | "close">>) {
  if (!candles.length) return [];

  const low = Math.min(...candles.map((candle) => candle.low));
  const high = Math.max(...candles.map((candle) => candle.high));
  const span = Math.max(Number.EPSILON, high - low);

  return candles.flatMap((candle) =>
    [candle.open, candle.high, candle.low, candle.close].map((value) => (value - low) / span),
  );
}

function resample(values: number[], length: number) {
  if (values.length === length) return values;
  if (values.length < 2) return Array(length).fill(values[0] ?? 0);

  return Array.from({ length }, (_, index) => {
    const position = (index * (values.length - 1)) / Math.max(1, length - 1);
    const left = Math.floor(position);
    const weight = position - left;

    return (
      values[left] * (1 - weight) +
      values[Math.min(left + 1, values.length - 1)] * weight
    );
  });
}

function similarity(left: number[], right: number[]) {
  const length = Math.max(left.length, right.length);
  if (!length) return 0;

  const source = resample(left, length);
  const target = resample(right, length);

  const difference =
    source.reduce((sum, value, index) => sum + Math.abs(value - target[index]), 0) / length;

  return clamp(1 - difference) * 100;
}

function projectPrice(
  value: number,
  source: Candle[],
  target: ReturnType<typeof normaliseCandles>,
) {
  const range = (candles: Array<Pick<Candle, "high" | "low">>) => {
    const low = Math.min(...candles.map((candle) => candle.low));
    const high = Math.max(...candles.map((candle) => candle.high));

    return { low, span: Math.max(Number.EPSILON, high - low) };
  };

  const from = range(source);
  const to = range(target);

  return to.low + ((value - from.low) / from.span) * to.span;
}

function zoneSignature(
  candles: Array<Pick<Candle, "high" | "low" | "close">>,
  low: number,
  high: number,
) {
  const counts = candles.reduce(
    (result, candle) => [
      result[0] + Number(candle.high >= low && candle.low <= high),
      result[1] + Number(candle.close >= low && candle.close <= high),
      result[2] + Number(candle.close > high),
    ],
    [0, 0, 0],
  );

  return counts.map((count) => count / Math.max(1, candles.length));
}

function levelSignature(
  candles: Array<Pick<Candle, "high" | "low" | "close">>,
  price: number,
) {
  let touches = 0;
  let closesAbove = 0;
  let crosses = 0;

  candles.forEach((candle, index) => {
    touches += Number(candle.high >= price && candle.low <= price);
    closesAbove += Number(candle.close > price);

    if (
      index &&
      (candles[index - 1].close - price) * (candle.close - price) < 0
    ) {
      crosses += 1;
    }
  });

  return [touches, closesAbove, crosses].map(
    (count) => count / Math.max(1, candles.length),
  );
}

function interactionScore(
  trigger: StrategyAnnotation["trigger"],
  reference: number[],
  candidate: number[],
) {
  if (trigger === "touch") return similarity([reference[0]], [candidate[0]]);
  if (trigger === "cross") return similarity([reference[2]], [candidate[2]]);
  if (trigger === "close_above") return similarity([reference[1]], [candidate[1]]);

  if (trigger === "close_below") {
    return similarity([1 - reference[1]], [1 - candidate[1]]);
  }

  if (trigger === "rejection") {
    return similarity(
      [Math.max(0, reference[0] - reference[1])],
      [Math.max(0, candidate[0] - candidate[1])],
    );
  }

  return similarity(reference, candidate);
}

export function scoreAnnotation(
  reference: Candle[],
  candidate: Candle[],
  annotation: StrategyAnnotation,
  alignment: number[],
  candidateBounds?: { start: number; end: number },
) {
  const normalised = normaliseCandles(candidate);
  const mapped = mappedBounds(reference, candidate.length, annotation, alignment);
  const last = Math.max(0, normalised.length - 1);

  const requestedStart = candidateBounds?.start ?? mapped.start;
  const requestedEnd = candidateBounds?.end ?? mapped.end;

  const start = Math.max(0, Math.min(last, Math.min(requestedStart, requestedEnd)));
  const end = Math.max(start, Math.min(last, Math.max(requestedStart, requestedEnd)));

  const source = reference.slice(
    mapped.source.start,
    mapped.source.end + 1,
  );

  const target = normalised.slice(start, end + 1);
  let score = similarity(shape(source), shape(target));

  if (annotation.kind === "zone") {
    score = interactionScore(
      annotation.trigger,
      zoneSignature(source, annotation.priceLow, annotation.priceHigh),
      zoneSignature(
        target,
        projectPrice(annotation.priceLow, reference, normalised),
        projectPrice(annotation.priceHigh, reference, normalised),
      ),
    );
  } else if (annotation.kind === "level") {
    score = interactionScore(
      annotation.trigger,
      levelSignature(source, annotation.price),
      levelSignature(target, projectPrice(annotation.price, reference, normalised)),
    );
  }

  return { score, start, end };
}

export function compareSemanticSnapshot(
  reference: StrategySnapshot,
  candidate: Candle[],
  referenceIndex: number,
  structuralScore: number,
): SemanticValidation | null {
  if (!reference.annotations.length) return null;

  const alignment = alignCandleStructure(reference.candles, candidate);
  if (!alignment.length) return null;

  const active = reference.annotations.filter(
    (annotation) => annotation.importance !== "informational",
  );

  const results = active
    .filter((annotation) => annotation.role === "structure")
    .map((annotation): SemanticResult => {
      const match = scoreAnnotation(reference.candles, candidate, annotation, alignment);

      return {
        id: annotation.id,
        conceptId: annotation.conceptId,
        label: annotation.label,
        role: annotation.role,
        importance: annotation.importance,
        score: match.score,
        passed: annotation.importance !== "required" || match.score >= GATE,
        matchedStartIndex: match.start,
        matchedEndIndex: match.end,
        referenceIndex,
      };
    })
    .sort((left, right) => left.matchedStartIndex - right.matchedStartIndex);

  const weight = (result: SemanticResult) => result.importance === "required" ? 2 : 1;
  const weights = results.reduce((sum, result) => sum + weight(result), 0);

  const score =
    results.length && weights
      ? results.reduce((sum, result) => sum + result.score * weight(result), 0) / weights
      : structuralScore;

  const qualified = results.every((result) => result.passed);

  const execution = active
    .filter((annotation) => annotation.role !== "structure")
    .map((annotation): SemanticPlacement => {
      const mapped = mappedBounds(reference.candles, candidate.length, annotation, alignment);

      return {
        id: annotation.id,
        conceptId: annotation.conceptId,
        label: annotation.label,
        role: annotation.role,
        matchedStartIndex: mapped.start,
        matchedEndIndex: mapped.end,
        referenceIndex,
        priceAnchor: annotation.kind === "marker" ? annotation.priceAnchor : undefined,
      };
    })
    .sort((left, right) => left.matchedStartIndex - right.matchedStartIndex);

  return { qualified, score, results, execution };
}
