import { StrategyAnnotation, StrategySnapshot } from "@/app/components/handlers/annotations";
import { Candle } from "@/app/components/types/charts";
import { alignCandleStructure, normaliseCandles } from "./similarity";

export type SemanticPlacement = {
  id: string;
  conceptId: string;
  label: string;
  role: StrategyAnnotation["role"];
  matchedStartIndex: number;
  matchedEndIndex: number;
  referenceIndex: number;
  priceAnchor?: "open" | "high" | "low" | "close";
  forming?: boolean;
  support?: number;
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
    const end = Math.min(last, start + Math.max(0, annotation.candles.length - 1));

    return { start, end };
  }

  const start = Math.round(clamp(Math.min(annotation.startRatio, annotation.endRatio)) * last);
  const end = Math.max(
    start,
    Math.round(clamp(Math.max(annotation.startRatio, annotation.endRatio)) * last),
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

  const source =
    annotation.kind === "candle_group"
      ? annotation.candles
      : reference.slice(mapped.source.start, mapped.source.end + 1);

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

function visibleAnnotation(
  reference: StrategySnapshot,
  annotation: StrategyAnnotation,
  prefixLength: number,
) {
  const source = bounds(reference.candles, annotation);
  if (prefixLength <= source.start) return null;
  const last = Math.max(0, prefixLength - 1);
  const complete = last >= source.end;

  if (annotation.kind === "candle_group") {
    return {
      annotation: {
        ...annotation,
        candles: annotation.candles.slice(0, prefixLength - source.start),
      } as StrategyAnnotation,
      complete,
    };
  }
  if (annotation.kind === "marker") {
    return annotation.candleIndex <= last ? { annotation, complete: true } : null;
  }

  const startRatio = Math.min(source.start, last) / Math.max(1, last);
  const endRatio = Math.min(source.end, last) / Math.max(1, last);
  return {
    annotation: { ...annotation, startRatio, endRatio } as StrategyAnnotation,
    complete,
  };
}

export function compareSemanticSnapshots(
  references: StrategySnapshot[],
  candidate: Candle[],
  structuralScores: number[],
): SemanticValidation | null {
  const requiredSupport = Math.max(1, Math.ceil(references.length / 2));
  const groups = new Map<string, Array<{
    annotation: StrategyAnnotation;
    reference: StrategySnapshot;
    referenceIndex: number;
  }>>();

  references.forEach((reference, referenceIndex) => {
    reference.annotations
      .filter(({ importance }) => importance !== "informational")
      .forEach((annotation) => {
        const key = `${annotation.conceptId}:${annotation.role}:${annotation.kind}`;
        const group = groups.get(key) ?? [];
        group.push({ annotation, reference, referenceIndex });
        groups.set(key, group);
      });
  });

  const placements = [...groups.values()].flatMap((group) => {
    const support = new Set(group.map(({ referenceIndex }) => referenceIndex)).size;
    if (support < requiredSupport) return [];

    const matches = group.flatMap(({ annotation, reference, referenceIndex }) => {
      const prefixLength = Math.min(candidate.length, reference.candles.length);
      const visible = visibleAnnotation(reference, annotation, prefixLength);
      const prefix = reference.candles.slice(0, prefixLength);
      if (!visible || !prefix.length) return [];
      const alignment = alignCandleStructure(prefix, candidate);
      if (!alignment.length) return [];
      const match = scoreAnnotation(prefix, candidate, visible.annotation, alignment);
      return [{ annotation, referenceIndex, complete: visible.complete, ...match }];
    });
    if (!matches.length) return [];

    const representative = matches.reduce((best, match) =>
      match.score > best.score ? match : best);
    const annotation = representative.annotation;
    const average = (select: (match: typeof representative) => number) =>
      matches.reduce((sum, match) => sum + select(match), 0) / matches.length;
    const importance = group.filter(({ annotation: item }) => item.importance === "required").length >= requiredSupport
      ? "required" as const
      : "preferred" as const;

    return [{
      id: annotation.id,
      conceptId: annotation.conceptId,
      label: annotation.label,
      role: annotation.role,
      importance,
      score: average(({ score }) => score),
      matchedStartIndex: Math.round(average(({ start }) => start)),
      matchedEndIndex: Math.round(average(({ end }) => end)),
      referenceIndex: representative.referenceIndex,
      priceAnchor: annotation.kind === "marker" ? annotation.priceAnchor : undefined,
      forming: matches.some(({ complete }) => !complete),
      support,
    }];
  });

  if (!placements.length) return null;
  const results = placements
    .filter(({ role }) => role === "structure")
    .map((placement): SemanticResult => ({
      ...placement,
      passed: placement.importance !== "required" || placement.score >= GATE,
    }));
  const execution = placements.filter(({ role }) => role !== "structure");
  const weights = results.reduce(
    (sum, result) => sum + (result.importance === "required" ? 2 : 1),
    0,
  );
  const fallback = structuralScores.length
    ? structuralScores.reduce((sum, score) => sum + score, 0) / structuralScores.length
    : 0;
  const score = weights
    ? results.reduce(
        (sum, result) => sum + result.score * (result.importance === "required" ? 2 : 1),
        0,
      ) / weights
    : fallback;

  return {
    qualified: results.every(({ passed }) => passed),
    score,
    results: results.sort((left, right) => left.matchedStartIndex - right.matchedStartIndex),
    execution: execution.sort((left, right) => left.matchedStartIndex - right.matchedStartIndex),
  };
}
