import type { Candle } from "@/app/components/types/charts";
import type {
  SemanticMark,
  SemanticPlacement,
  SemanticResult,
  StrategyAnnotation,
  StrategySnapshot,
  ValidationCandidate,
} from "./types";

const isScored = (
  placement: SemanticPlacement | SemanticResult,
): placement is SemanticResult => "score" in placement;

function projectPrice(
  value: number,
  source: Candle[],
  target: Candle[],
) {
  const bounds = (candles: Candle[]) => {
    const low = Math.min(...candles.map((candle) => candle.low));
    const high = Math.max(...candles.map((candle) => candle.high));

    return {
      low,
      span: Math.max(Number.EPSILON, high - low),
    };
  };
  const from = bounds(source);
  const to = bounds(target);

  return to.low + ((value - from.low) / from.span) * to.span;
}

export function buildValidationMarks(
  candidate: ValidationCandidate,
  references: StrategySnapshot[],
): SemanticMark[] {
  if (!candidate.semantic || !candidate.candles.length) return [];

  const placements = [
    ...candidate.semantic.results,
    ...(candidate.semantic.qualified
      ? candidate.semantic.execution
      : []),
  ];

  return placements.flatMap((placement): SemanticMark[] => {
    const reference = references[placement.referenceIndex];
    const annotation =
      reference?.annotations.find(
        ({ id }) => id === placement.id,
      ) ??
      reference?.annotations.find(
        ({ conceptId }) => conceptId === placement.conceptId,
      );

    if (!reference || !annotation) return [];

    const last = candidate.candles.length - 1;
    const start = Math.max(
      0,
      Math.min(last, placement.matchedStartIndex),
    );
    const end = Math.max(
      start,
      Math.min(last, placement.matchedEndIndex),
    );
    let projected: StrategyAnnotation;

    if (annotation.kind === "candle_group") {
      projected = {
        ...annotation,
        startIndex: start,
        endIndex: end,
      };
    } else if (annotation.kind === "zone") {
      projected = {
        ...annotation,
        startIndex: start,
        endIndex: end,
        priceHigh: projectPrice(
          annotation.priceHigh,
          reference.candles,
          candidate.candles,
        ),
        priceLow: projectPrice(
          annotation.priceLow,
          reference.candles,
          candidate.candles,
        ),
      };
    } else if (annotation.kind === "level") {
      projected = {
        ...annotation,
        startIndex: start,
        endIndex: end,
        price: projectPrice(
          annotation.price,
          reference.candles,
          candidate.candles,
        ),
      };
    } else {
      const candle = candidate.candles[start];
      const priceAnchor =
        placement.priceAnchor ?? annotation.priceAnchor;

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
      status:
        weak &&
        scored &&
        placement.importance === "required"
          ? "fail"
          : weak
            ? "weak"
            : "pass",
    }];
  });
}
