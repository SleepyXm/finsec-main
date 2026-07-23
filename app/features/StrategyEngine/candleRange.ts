import type { Candle } from "@/app/components/types/charts";

export type CandleBoundary = "start" | "end";

export type CandleRange = {
  startIndex: number;
  endIndex: number;
};

export function candleRange(
  startIndex: number,
  endIndex: number,
  candleCount: number,
): CandleRange {
  const lastIndex = Math.max(0, candleCount - 1);
  const start = Math.max(
    0,
    Math.min(lastIndex, Math.min(startIndex, endIndex)),
  );
  const end = Math.max(
    start,
    Math.min(lastIndex, Math.max(startIndex, endIndex)),
  );

  return {
    startIndex: start,
    endIndex: end,
  };
}

export function resizeCandleRange(
  range: CandleRange,
  boundary: CandleBoundary,
  candleIndex: number,
  candleCount: number,
  minimumLength = 1,
): CandleRange {
  const minimumSpan = Math.max(0, minimumLength - 1);
  const next =
    boundary === "start"
      ? candleRange(
          Math.min(candleIndex, range.endIndex - minimumSpan),
          range.endIndex,
          candleCount,
        )
      : candleRange(
          range.startIndex,
          Math.max(candleIndex, range.startIndex + minimumSpan),
          candleCount,
        );

  return next;
}

export function stepCandleRange(
  range: CandleRange,
  boundary: CandleBoundary,
  delta: -1 | 1,
  candleCount: number,
  minimumLength = 1,
): CandleRange {
  const candleIndex =
    (boundary === "start" ? range.startIndex : range.endIndex) + delta;

  return resizeCandleRange(
    range,
    boundary,
    candleIndex,
    candleCount,
    minimumLength,
  );
}

export function candleRangeByTime(
  candles: Array<Pick<Candle, "time">>,
  startTime: Candle["time"] | undefined,
  endTime: Candle["time"] | undefined,
): CandleRange | null {
  if (startTime == null || endTime == null) return null;

  const startIndex = candles.findIndex(({ time }) => time === startTime);
  const endIndex = candles.findIndex(({ time }) => time === endTime);

  return startIndex < 0 || endIndex < 0
    ? null
    : candleRange(startIndex, endIndex, candles.length);
}
