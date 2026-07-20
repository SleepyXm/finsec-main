import { StrategyAnnotation, StrategySnapshot } from "@/app/handlers/annotations";
import { Candle } from "@/app/types/charts";
import { alignCandleStructure, normaliseCandles } from "./similarity";

export type SemanticPlacement = {
  id: string;
  conceptId: string;
  label: string;
  role: StrategyAnnotation["role"];
  matchedStartRatio: number;
  matchedEndRatio: number;
  referenceIndex: number;
};

export type SemanticResult = SemanticPlacement & {
  importance: StrategyAnnotation["importance"];
  score: number;
  passed: boolean;
};

export type SemanticValidation = {
  qualified: boolean;
  score: number;
  results: SemanticResult[];
  execution: SemanticPlacement[];
};

const GATE = 70;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

function bounds(reference: Candle[], annotation: StrategyAnnotation) {
  const last = Math.max(0, reference.length - 1);

  if (annotation.kind === "marker") {
    const index = Math.max(0, Math.min(last, annotation.candleIndex));
    return { start: index, end: index };
  }

  if (annotation.kind === "candle_group") {
    const located = reference.findIndex((_, index) =>
      index + annotation.candles.length <= reference.length &&
      annotation.candles.every((candle, offset) => {
        const referenceCandle = reference[index + offset];

        return (
          referenceCandle.open === candle.open &&
          referenceCandle.high === candle.high &&
          referenceCandle.low === candle.low &&
          referenceCandle.close === candle.close
        );
      }),
    );

    const start = located >= 0 ? located : 0;
    const end = Math.min(
      last,
      start + Math.max(0, annotation.candles.length - 1),
    );

    return { start, end };
  }

  const start = Math.round(
    clamp(Math.min(annotation.startRatio, annotation.endRatio)) * last,
  );

  const end = Math.max(
    start,
    Math.round(
      clamp(Math.max(annotation.startRatio, annotation.endRatio)) * last,
    ),
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
    Math.round(
      index *
      (candidateLength - 1) /
      Math.max(1, reference.length - 1),
    );

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
  return candles.flatMap((candle) => [candle.open, candle.high, candle.low, candle.close]
    .map((value) => (value - low) / span));
}

function resample(values: number[], length: number) {
  if (values.length === length) return values;
  if (values.length < 2) return Array(length).fill(values[0] ?? 0);
  return Array.from({ length }, (_, index) => {
    const position = index * (values.length - 1) / Math.max(1, length - 1);
    const left = Math.floor(position);
    const weight = position - left;
    return values[left] * (1 - weight) + values[Math.min(left + 1, values.length - 1)] * weight;
  });
}

function similarity(left: number[], right: number[]) {
  const length = Math.max(left.length, right.length);
  if (!length) return 0;
  const source = resample(left, length);
  const target = resample(right, length);
  return clamp(1 - source.reduce((sum, value, index) => sum + Math.abs(value - target[index]), 0) / length) * 100;
}

function projectPrice(value: number, source: Candle[], target: ReturnType<typeof normaliseCandles>) {
  const range = (candles: Array<Pick<Candle, "high" | "low">>) => {
    const low = Math.min(...candles.map((candle) => candle.low));
    return { low, span: Math.max(Number.EPSILON, Math.max(...candles.map((candle) => candle.high)) - low) };
  };
  const from = range(source);
  const to = range(target);
  return to.low + ((value - from.low) / from.span) * to.span;
}

function zoneSignature(candles: Array<Pick<Candle, "high" | "low" | "close">>, low: number, high: number) {
  const counts = candles.reduce((result, candle) => [
    result[0] + Number(candle.high >= low && candle.low <= high),
    result[1] + Number(candle.close >= low && candle.close <= high),
    result[2] + Number(candle.close > high),
  ], [0, 0, 0]);
  return counts.map((count) => count / Math.max(1, candles.length));
}

function levelSignature(candles: Array<Pick<Candle, "high" | "low" | "close">>, price: number) {
  let touches = 0, closesAbove = 0, crosses = 0;
  candles.forEach((candle, index) => {
    touches += Number(candle.high >= price && candle.low <= price);
    closesAbove += Number(candle.close > price);
    if (index && (candles[index - 1].close - price) * (candle.close - price) < 0) crosses += 1;
  });
  return [touches, closesAbove, crosses].map((count) => count / Math.max(1, candles.length));
}

function interactionScore(trigger: StrategyAnnotation["trigger"], reference: number[], candidate: number[]) {
  if (trigger === "touch") return similarity([reference[0]], [candidate[0]]);
  if (trigger === "cross") return similarity([reference[2]], [candidate[2]]);
  if (trigger === "close_above") return similarity([reference[1]], [candidate[1]]);
  if (trigger === "close_below") return similarity([1 - reference[1]], [1 - candidate[1]]);
  if (trigger === "rejection") return similarity([Math.max(0, reference[0] - reference[1])], [Math.max(0, candidate[0] - candidate[1])]);
  return similarity(reference, candidate);
}

function scoreAnnotation(
  reference: Candle[],
  candidate: Candle[],
  annotation: StrategyAnnotation,
  alignment: number[],
) {
  const normalised = normaliseCandles(candidate);

  const mapped = mappedBounds(
    reference,
    candidate.length,
    annotation,
    alignment,
  );

  const source = annotation.kind === "candle_group"
    ? annotation.candles
    : reference.slice(mapped.source.start, mapped.source.end + 1);

  const target = normalised.slice(mapped.start, mapped.end + 1);

  let score = similarity(shape(source), shape(target));

  if (
    annotation.kind === "zone" &&
    annotation.priceLow != null &&
    annotation.priceHigh != null
  ) {
    score = interactionScore(
      annotation.trigger,
      zoneSignature(
        source,
        annotation.priceLow,
        annotation.priceHigh,
      ),
      zoneSignature(
        target,
        projectPrice(annotation.priceLow, reference, normalised),
        projectPrice(annotation.priceHigh, reference, normalised),
      ),
    );
  } else if (
    annotation.kind === "level" &&
    annotation.price != null
  ) {
    score = interactionScore(
      annotation.trigger,
      levelSignature(source, annotation.price),
      levelSignature(
        target,
        projectPrice(annotation.price, reference, normalised),
      ),
    );
  }

  return {
    score,
    start: mapped.start,
    end: mapped.end,
  };
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
      const match = scoreAnnotation(
        reference.candles,
        candidate,
        annotation,
        alignment,
      );

      return {
        id: annotation.id,
        conceptId: annotation.conceptId,
        label: annotation.label,
        role: annotation.role,
        importance: annotation.importance,
        score: match.score,
        passed:
          annotation.importance !== "required" ||
          match.score >= GATE,
        matchedStartIndex: match.start,
        matchedEndIndex: match.end,
        referenceIndex,
      };
    })
    .sort(
      (left, right) =>
        left.matchedStartIndex - right.matchedStartIndex,
    );

  const weight = (result: SemanticResult) =>
    result.importance === "required" ? 2 : 1;

  const weights = results.reduce(
    (sum, result) => sum + weight(result),
    0,
  );

  const score = results.length
    ? results.reduce(
        (sum, result) =>
          sum + result.score * weight(result),
        0,
      ) / weights
    : structuralScore;

  const qualified = results.every((result) => result.passed);

  const execution = qualified
    ? reference.annotations
        .filter((annotation) => annotation.role !== "structure")
        .map((annotation): SemanticPlacement => {
          const mapped = mappedBounds(
            reference.candles,
            candidate.length,
            annotation,
            alignment,
          );

          return {
            id: annotation.id,
            conceptId: annotation.conceptId,
            label: annotation.label,
            role: annotation.role,
            matchedStartIndex: mapped.start,
            matchedEndIndex: mapped.end,
            referenceIndex,
          };
        })
        .sort(
          (left, right) =>
            left.matchedStartIndex - right.matchedStartIndex,
        )
    : [];

  return {
    qualified,
    score,
    results,
    execution,
  };
}