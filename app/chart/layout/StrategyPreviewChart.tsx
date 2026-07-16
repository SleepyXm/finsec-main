"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import type { AnnotationCandle } from "@/app/handlers/annotations";

export function StrategyPreviewChart({ candles }: { candles: AnnotationCandle[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length < 2) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(226,232,240,0.35)",
      },
      grid: {
        vertLines: { color: "rgba(226,232,240,0.04)" },
        horzLines: { color: "rgba(226,232,240,0.04)" },
      },
      rightPriceScale: { visible: false, borderVisible: false },
      timeScale: { visible: false, borderVisible: false },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#14b8a6",
      downColor: "#ef4444",
      borderUpColor: "#2dd4bf",
      borderDownColor: "#f87171",
      wickUpColor: "#2dd4bf",
      wickDownColor: "#f87171",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(candles.map((candle) => ({
      ...candle,
      time: candle.time as UTCTimestamp,
    })));
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [candles]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
