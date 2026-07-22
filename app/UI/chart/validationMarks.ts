import type {
  StrategyAnnotation,
  StrategySnapshot,
} from "@/app/components/handlers/annotations";
import type { Candle } from "@/app/components/types/charts";
import type {
  SemanticPlacement,
  SemanticResult,
} from "@/app/(pages)/chart/SimilaritySearch/semantic";
import type { ValidationCandidate } from "@/app/(pages)/chart/SimilaritySearch/validation";
import type { SemanticMark } from "./SemanticMarkShapes";

const isScored = (
  placement: SemanticPlacement | SemanticResult,
): placement is SemanticResult => "score" in placement;

function projectPrice(value: number, source: Candle[], target: Candle[]) {
  const bounds = (candles: Candle[]) => {
    const low = Math.min(...candles.map((candle) => candle.low));
    const high = Math.max(...candles.map((candle) => candle.high));
    return { low, span: Math.max(Number.EPSILON, high - low) };
  };
  const from = bounds(source);
  const to = bounds(target);
  return to.low + ((value - from.low) / from.span) * to.span;
}

export function buildValidationMarks(
  candidate: ValidationCandidate,
  references: StrategySnapshot[],
) {
  if (!candidate.semantic || !candidate.candles.length) return [];
  const placements = [
    ...candidate.semantic.results,
    ...(candidate.semantic.qualified ? candidate.semantic.execution : []),
  ];

  return placements.flatMap((placement): SemanticMark[] => {
    const reference = references[placement.referenceIndex];
    const annotation = reference?.annotations.find(({ id }) => id === placement.id) ??
      reference?.annotations.find(({ conceptId }) => conceptId === placement.conceptId);
    if (!reference || !annotation) return [];

    const last = candidate.candles.length - 1;
    const ratioLast = Math.max(1, last);
    const start = Math.max(0, Math.min(last, placement.matchedStartIndex));
    const end = Math.max(start, Math.min(last, placement.matchedEndIndex));
    let projected: StrategyAnnotation;

    if (annotation.kind === "candle_group") {
      projected = {
        ...annotation,
        candles: candidate.candles.slice(start, end + 1).map(
          ({ open, high, low, close }) => ({ open, high, low, close }),
        ),
      };
    } else if (annotation.kind === "zone") {
      projected = {
        ...annotation,
        startRatio: start / ratioLast,
        endRatio: end / ratioLast,
        priceHigh: projectPrice(annotation.priceHigh, reference.candles, candidate.candles),
        priceLow: projectPrice(annotation.priceLow, reference.candles, candidate.candles),
      };
    } else if (annotation.kind === "level") {
      projected = {
        ...annotation,
        startRatio: start / ratioLast,
        endRatio: end / ratioLast,
        price: projectPrice(annotation.price, reference.candles, candidate.candles),
      };
    } else {
      const candle = candidate.candles[start];
      const priceAnchor = placement.priceAnchor ?? annotation.priceAnchor;
      projected = {
        ...annotation,
        candleIndex: start,
        priceAnchor,
        price: candle[priceAnchor],
      };
    }

    const scored = isScored(placement);
    const weak = scored && placement.score < 70;
    return [{
      annotation: projected,
      score: scored ? placement.score : undefined,
      status: weak && scored && placement.importance === "required"
        ? "fail"
        : weak ? "weak" : "pass",
    }];
  });
}

