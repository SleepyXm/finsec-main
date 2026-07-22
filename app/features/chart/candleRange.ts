import type { Candle } from "@/app/components/types/charts";

export type CandleBoundary = "start" | "end";

export type CandleRange = {
  startIndex: number;
  endIndex: number;
};

export function candleRange(startIndex: number, endIndex: number, candleCount: number): CandleRange {
  const lastIndex = Math.max(0, candleCount - 1);
  const start = Math.max(0, Math.min(lastIndex, Math.min(startIndex, endIndex)));
  const end = Math.max(start, Math.min(lastIndex, Math.max(startIndex, endIndex)));
  return { startIndex: start, endIndex: end };
}

export function resizeCandleRange(
  range: CandleRange,
  boundary: CandleBoundary,
  candleIndex: number,
  candleCount: number,
): CandleRange {
  return boundary === "start"
    ? candleRange(Math.min(candleIndex, range.endIndex), range.endIndex, candleCount)
    : candleRange(range.startIndex, Math.max(candleIndex, range.startIndex), candleCount);
}

export function candlesInRange<T>(candles: T[], range: CandleRange): T[] {
  return candles.slice(range.startIndex, range.endIndex + 1);
}

export function candleRangeByTime(
  candles: Array<Pick<Candle, "time">>,
  startTime: Candle["time"] | undefined,
  endTime: Candle["time"] | undefined,
): CandleRange | null {
  if (startTime == null || endTime == null) return null;
  const startIndex = candles.findIndex(({ time }) => time === startTime);
  const endIndex = candles.findIndex(({ time }) => time === endTime);
  return startIndex < 0 || endIndex < 0 ? null : candleRange(startIndex, endIndex, candles.length);
}

export function nearestCandleIndex(
  candles: Array<Pick<Candle, "time">>,
  x: number,
  coordinate: (time: Candle["time"]) => number | null,
): number {
  return candles.reduce((best, item, index) => {
    const itemX = coordinate(item.time);
    const distance = itemX == null ? Number.POSITIVE_INFINITY : Math.abs(itemX - x);
    return distance < best.distance ? { index, distance } : best;
  }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
}
