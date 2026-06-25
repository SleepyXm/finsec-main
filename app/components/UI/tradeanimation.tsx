"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

type Candle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

type TapeCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
  ticks: number[];
};

export function AuthChartAnimation() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [snapshotActive, setSnapshotActive] = useState(false);

  const tape = useMemo(() => createLoopTape(30), []);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "rgba(255, 255, 255, 0.35)",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.035)" },
        horzLines: { color: "rgba(255, 255, 255, 0.035)" },
      },
      rightPriceScale: {
        visible: false,
        borderVisible: false,
      },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "rgba(147, 197, 253, 0.9)",
      downColor: "rgba(59, 130, 246, 0.55)",
      borderUpColor: "rgba(219, 234, 254, 0.9)",
      borderDownColor: "rgba(96, 165, 250, 0.65)",
      wickUpColor: "rgba(219, 234, 254, 0.9)",
      wickDownColor: "rgba(96, 165, 250, 0.65)",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const startTime = Math.floor(Date.now() / 1000) as UTCTimestamp;

    let logicalIndex = 0;
    let tapeIndex = 0;
    let tickIndex = 0;

    const initialCandles = tape.slice(0, 24).map((candle, index) =>
      toCandle(candle, (startTime + index * 60) as UTCTimestamp)
    );

    logicalIndex = initialCandles.length;
    tapeIndex = initialCandles.length % tape.length;

    series.setData(initialCandles);
    chart.timeScale().fitContent();

    let active = makeActiveCandle(
      tape[tapeIndex],
      (startTime + logicalIndex * 60) as UTCTimestamp
    );

    const tickTimer = window.setInterval(() => {
      const currentTape = tape[tapeIndex];
      const tickValue = currentTape.ticks[tickIndex];

      active.close = tickValue;
      active.high = Math.max(active.high, tickValue);
      active.low = Math.min(active.low, tickValue);

      series.update(active);

      tickIndex += 1;

      if (tickIndex >= currentTape.ticks.length) {
        tickIndex = 0;
        logicalIndex += 1;
        tapeIndex = (tapeIndex + 1) % tape.length;

        active = makeActiveCandle(
          tape[tapeIndex],
          (startTime + logicalIndex * 60) as UTCTimestamp
        );

        series.update(active);
        chart.timeScale().scrollToPosition(4, false);
      }
    }, 180);

    const snapshotTimer = window.setInterval(() => {
      setSnapshotActive(true);

      window.setTimeout(() => {
        setSnapshotActive(false);
      }, 1800);
    }, 6000);

    return () => {
      window.clearInterval(tickTimer);
      window.clearInterval(snapshotTimer);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [tape]);

  return (
    <div className="auth-chart-wrap">
      <div ref={containerRef} className="auth-chart" />

      <div className={snapshotActive ? "chart-snapshot is-active" : "chart-snapshot"}>
        <div className="snapshot-corner snapshot-corner-tl" />
        <div className="snapshot-corner snapshot-corner-tr" />
        <div className="snapshot-corner snapshot-corner-bl" />
        <div className="snapshot-corner snapshot-corner-br" />

        <div className="snapshot-label">Strategy snapshot</div>
      </div>
    </div>
  );
}

function createLoopTape(length: number): TapeCandle[] {
  let price = 100;

  return Array.from({ length }, (_, index) => {
    const direction = Math.sin(index * 0.75) + Math.cos(index * 0.35);
    const drift = direction * 1.4;
    const volatility = 1.8 + Math.abs(Math.sin(index)) * 1.2;

    const open = price;
    const close = open + drift;
    const high = Math.max(open, close) + volatility;
    const low = Math.min(open, close) - volatility * 0.75;

    price = close;

    return {
      open,
      high,
      low,
      close,
      ticks: createTicks(open, high, low, close, 8),
    };
  });
}

function createTicks(
  open: number,
  high: number,
  low: number,
  close: number,
  count: number
) {
  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    const wave = Math.sin(progress * Math.PI * 2) * 0.55;
    const path = open + (close - open) * progress + wave;

    return Math.min(high, Math.max(low, path));
  });
}

function toCandle(candle: TapeCandle, time: UTCTimestamp): Candle {
  return {
    time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function makeActiveCandle(candle: TapeCandle, time: UTCTimestamp): Candle {
  return {
    time,
    open: candle.open,
    high: candle.open,
    low: candle.open,
    close: candle.open,
  };
}