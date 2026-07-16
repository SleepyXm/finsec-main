import { useEffect, useState, useRef } from 'react';
import { Candle } from '@/app/types/charts';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE2

export function useChartData(ticker: string, interval: string, historicalData: Candle[] | null) {
  const [data, setData] = useState<Candle[] | null>(null);
  const seriesKey = `${ticker}:${interval}`;
  const seriesKeyRef = useRef(seriesKey);

  useEffect(() => {
    if (seriesKeyRef.current !== seriesKey) {
      seriesKeyRef.current = seriesKey;
      setData(null);
      return;
    }

    if (!historicalData?.length) return;

    setData((current) => {
      const byTime = new Map<number, Candle>();
      historicalData.forEach((candle) => byTime.set(candle.time, candle));
      // Current data is applied last so an in-memory live update wins over an
      // overlapping historical candle delivered during a domino page shift.
      current?.forEach((candle) => byTime.set(candle.time, candle));
      return [...byTime.values()].sort((a, b) => Number(a.time) - Number(b.time));
    });
  }, [seriesKey, historicalData]);

  const updateLastCandle = (tick: Candle) => {
    setData(prev => {
      if (!prev || prev.length === 0) return prev;
      const updated = [...prev];
      const last = updated[updated.length - 1];

      // If same candle, update it. If new candle, append it.
      if (last.time === tick.time) {
        updated[updated.length - 1] = { ...last, ...tick };
      } else if (tick.time > last.time) {
        updated.push(tick);
      }

      return updated;
    });
  };

  return { data, updateLastCandle, historicalData };
}
