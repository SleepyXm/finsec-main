"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, createChart, IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { createLoopTape, createSnapshotSignal, makeActiveCandle, materializeCandle, normalizeTime } from "./authChartData";
import { Candle } from "@/app/types/charts";

type SnapshotSignal = {
  mode: "entry" | "exit";
  direction: "long" | "short";
  entry: {
    x: number;
    y: number;
  };
  exit: {
    x: number;
    y: number;
  };
};

export function AuthChartAnimation() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [snapshotActive, setSnapshotActive] = useState(false);
  const [signal, setSignal] = useState<SnapshotSignal>(() =>
    createSnapshotSignal(),
  );

  // A deterministic tape keeps render pure and makes the ambient loop repeatable.
  const tape = useMemo(() => createLoopTape(30, 0x51f5ec), []);

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

    const visibleInitialCandles = 62;
    const startTime = normalizeTime(
      Math.floor(Date.now() / 1000) - visibleInitialCandles * 60,
    );

    let currentPrice = 100;
    let logicalIndex = 0;
    let tapeIndex = 0;
    let tickIndex = 0;

    const renderedCandles: Candle[] = [];

    for (let index = 0; index < visibleInitialCandles; index += 1) {
      const template = tape[index % tape.length];
      const time = (startTime + index * 60) as UTCTimestamp;
      const candle = materializeCandle(template, currentPrice, time);

      renderedCandles.push(candle);
      currentPrice = candle.close;
      logicalIndex += 1;
      tapeIndex = logicalIndex % tape.length;
    }

    series.setData(renderedCandles.map((candle) => ({
      ...candle,
      time: candle.time as UTCTimestamp,
    })));
    chart.timeScale().setVisibleLogicalRange({
      from: -2,
      to: 34,
    });

    let active = makeActiveCandle(
      tape[tapeIndex],
      currentPrice,
      (startTime + logicalIndex * 60) as UTCTimestamp,
    );

    const tickTimer = window.setInterval(() => {
      const currentTemplate = tape[tapeIndex];
      const tickDelta = currentTemplate.ticks[tickIndex];
      const tickValue = active.open + tickDelta;

      active.close = tickValue;
      active.high = Math.max(active.high, tickValue);
      active.low = Math.min(active.low, tickValue);

      series.update({ ...active, time: active.time as UTCTimestamp });

      tickIndex += 1;

      if (tickIndex >= currentTemplate.ticks.length) {
        renderedCandles.push({ ...active });

        if (renderedCandles.length > 80) {
          renderedCandles.shift();
        }

        currentPrice = active.close;
        tickIndex = 0;
        logicalIndex += 1;
        tapeIndex = (tapeIndex + 1) % tape.length;

        active = makeActiveCandle(
          tape[tapeIndex],
          currentPrice,
          (startTime + logicalIndex * 60) as UTCTimestamp,
        );

        series.update({ ...active, time: active.time as UTCTimestamp });
        chart.timeScale().scrollToPosition(4, false);
      }
    }, 180);

    let snapshotCloseTimer: number | null = null;

    const snapshotTimer = window.setInterval(() => {
      setSignal(createSnapshotSignal());
      setSnapshotActive(true);

      if (snapshotCloseTimer) {
        window.clearTimeout(snapshotCloseTimer);
      }

      snapshotCloseTimer = window.setTimeout(() => {
        setSnapshotActive(false);
      }, 2200);
    }, 6000);

    return () => {
      window.clearInterval(tickTimer);
      window.clearInterval(snapshotTimer);

      if (snapshotCloseTimer) {
        window.clearTimeout(snapshotCloseTimer);
      }

      chart.remove();

      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [tape]);

  return (
    <div className="auth-chart-wrap">
      <div ref={containerRef} className="auth-chart" />

      <div
        className={
          snapshotActive ? "chart-snapshot is-active" : "chart-snapshot"
        }
      >
        <div className="snapshot-corner snapshot-corner-tl" />
        <div className="snapshot-corner snapshot-corner-tr" />
        <div className="snapshot-corner snapshot-corner-bl" />
        <div className="snapshot-corner snapshot-corner-br" />

        <svg
          className="snapshot-trade-path"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <line
            x1={signal.entry.x}
            y1={signal.entry.y}
            x2={signal.exit.x}
            y2={signal.exit.y}
          />
        </svg>

        {signal.mode === "entry" && (
          <div
            className="snapshot-point snapshot-entry"
            style={{
              left: `${signal.entry.x}%`,
              top: `${signal.entry.y}%`,
            }}
          >
            
          </div>
        )}

        {signal.mode === "exit" && (
          <div
            className="snapshot-point snapshot-exit"
            style={{
              left: `${signal.exit.x}%`,
              top: `${signal.exit.y}%`,
            }}
          >
          </div>
        )}

        <div className="snapshot-label">
          {signal.mode === "entry" ? "Learning entry" : "Learning exit"}
        </div>
      </div>
    </div>
  );
}
