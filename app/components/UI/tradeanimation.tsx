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
  closeDelta: number;
  highExtra: number;
  lowExtra: number;
  ticks: number[];
};

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

  // Random once per mount, then loop that same path.
  const tape = useMemo(() => createLoopTape(30, Date.now()), []);

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

    series.setData(renderedCandles);
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

      series.update(active);

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

        series.update(active);
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

function createLoopTape(length: number, seed: number): TapeCandle[] {
  const random = createSeededRandom(seed);
  const bias = randomBetween(random, -0.08, 0.08);

  return Array.from({ length }, (_, index) => {
    const wave = Math.sin((index / length) * Math.PI * 2) * 0.85;
    const impulse = randomBetween(random, -1.55, 1.65);
    const closeDelta = wave + impulse + bias;

    const range = randomBetween(random, 1.25, 3.7);

    const highExtra = Math.max(
      0.5,
      Math.max(closeDelta, 0) + range * randomBetween(random, 0.45, 0.95),
    );

    const lowExtra = Math.max(
      0.5,
      Math.max(-closeDelta, 0) + range * randomBetween(random, 0.35, 0.85),
    );

    return {
      closeDelta,
      highExtra,
      lowExtra,
      ticks: createTicks(closeDelta, highExtra, lowExtra, 9, random),
    };
  });
}

function createTicks(
  closeDelta: number,
  highExtra: number,
  lowExtra: number,
  count: number,
  random: () => number,
) {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return 0;
    if (index === count - 1) return closeDelta;

    const progress = index / (count - 1);
    const wave =
      Math.sin(progress * Math.PI * 2) * randomBetween(random, 0.15, 0.65);
    const noise = randomBetween(random, -0.28, 0.28);
    const path = closeDelta * progress + wave + noise;

    return clamp(path, -lowExtra, highExtra);
  });
}

function materializeCandle(
  template: TapeCandle,
  open: number,
  time: UTCTimestamp,
): Candle {
  const close = open + template.closeDelta;
  const high = open + template.highExtra;
  const low = open - template.lowExtra;

  return {
    time,
    open,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    close,
  };
}

function makeActiveCandle(
  template: TapeCandle,
  open: number,
  time: UTCTimestamp,
): Candle {
  return {
    time,
    open,
    high: open,
    low: open,
    close: open + template.ticks[0],
  };
}

function createSnapshotSignal(): SnapshotSignal {
  const mode: "entry" | "exit" = Math.random() > 0.5 ? "entry" : "exit";
  const direction: "long" | "short" = Math.random() > 0.35 ? "long" : "short";

  const entryX = randomBetween(Math.random, 16, 34);
  const exitX = randomBetween(Math.random, 66, 86);

  if (direction === "long") {
    return {
      mode,
      direction,
      entry: {
        x: entryX,
        y: randomBetween(Math.random, 62, 76),
      },
      exit: {
        x: exitX,
        y: randomBetween(Math.random, 24, 42),
      },
    };
  }

  return {
    mode,
    direction,
    entry: {
      x: entryX,
      y: randomBetween(Math.random, 24, 42),
    },
    exit: {
      x: exitX,
      y: randomBetween(Math.random, 62, 76),
    },
  };
}

function normalizeTime(seconds: number): UTCTimestamp {
  return (Math.floor(seconds / 60) * 60) as UTCTimestamp;
}

function createSeededRandom(seed: number) {
  let value = seed >>> 0;

  return function random() {
    value += 0x6d2b79f5;

    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);

    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(random: () => number, min: number, max: number) {
  return min + random() * (max - min);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
