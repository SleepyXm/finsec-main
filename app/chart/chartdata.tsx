import { useEffect, useState, useRef } from 'react';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE2
const STOCK_DATA_URL = `${API_BASE}/stockdata?ticker_symbol=`;

export function useChartData<T extends { time: string } = any>(ticker: string, interval: string, historicalData: T[] | null) {
  const [data, setData] = useState<T[] | null>(null);

  useEffect(() => {
    setData(null); // clear immediately on ticker/interval change
    if (historicalData && historicalData.length > 0) {
      setData(historicalData);
    }
  }, [ticker, interval, historicalData]);

  const updateLastCandle = (tick: { time: number; open: number; high: number; low: number; close: number }) => {
    setData(prev => {
      if (!prev || prev.length === 0) return prev;
      const updated = [...prev];
      const last = updated[updated.length - 1] as any;

      // If same candle, update it. If new candle, append it.
      if (last.time === tick.time) {
        updated[updated.length - 1] = { ...last, ...tick };
      } else if (tick.time > last.time) {
        updated.push(tick as any);
      }

      return updated;
    });
  };

  return { data, updateLastCandle, historicalData };
}