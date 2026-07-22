import type { Candle } from "@/app/components/types/charts";
import type {
  FormationAssessment,
  ValidationCandidate,
} from "./validation";

export type FormationScorer = (candles: Candle[]) => FormationAssessment;

/**
 * Grow one historical window candle-by-candle. A start is abandoned as soon
 * as its prefix stops matching the snapshot consensus. The first prefix that
 * reaches the user's formation threshold is returned for review.
 */
export function runForwardPass({
  chartData,
  startIndex,
  maxLength,
  score,
}: {
  chartData: Candle[];
  startIndex: number;
  maxLength: number;
  score: FormationScorer;
}): ValidationCandidate | null {
  const finalIndex = Math.min(chartData.length - 1, startIndex + maxLength - 1);

  for (let endIndex = startIndex; endIndex <= finalIndex; endIndex += 1) {
    const candles = chartData.slice(startIndex, endIndex + 1);
    const assessment = score(candles);

    if (assessment.state === "invalid") return null;
    if (assessment.state === "forming" || assessment.state === "complete") {
      return {
        candles,
        result: assessment.result,
        semantic: assessment.semantic,
        referenceIndex: assessment.referenceIndex,
      };
    }
  }

  return null;
}

/** Find the strongest formation ending at the latest revealed candle. */
export function findCurrentFormation({
  visibleCandles,
  maxLength,
  score,
}: {
  visibleCandles: Candle[];
  maxLength: number;
  score: FormationScorer;
}): ValidationCandidate | null {
  if (!visibleCandles.length || maxLength < 1) return null;

  const firstStart = Math.max(0, visibleCandles.length - maxLength);
  let best: ValidationCandidate | null = null;

  for (let start = firstStart; start < visibleCandles.length; start += 1) {
    const candles = visibleCandles.slice(start);
    const assessment = score(candles);
    if (assessment.state !== "forming" && assessment.state !== "complete") continue;

    const candidate: ValidationCandidate = {
      candles,
      result: assessment.result,
      semantic: assessment.semantic,
      referenceIndex: assessment.referenceIndex,
    };
    if (
      !best || candidate.result.rank > best.result.rank ||
      (
        candidate.result.rank === best.result.rank &&
        candidate.candles.length > best.candles.length
      )
    ) best = candidate;
  }

  return best;
}
