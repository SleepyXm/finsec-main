"use client";

import { useEffect, useRef, useState } from "react";
import { ValidationCandidate } from "@/app/chart/chartcontext";
import { StrategyAnnotation, StrategySnapshot } from "@/app/handlers/annotations";
import { Candle } from "@/app/types/charts";
import { SemanticPlacement, SemanticResult } from "../../SimilaritySearch/semantic";

export type SemanticMark = { annotation: StrategyAnnotation; score?: number; status?: "pass" | "weak" | "fail" };
type ScreenMark = SemanticMark & { left: number; right: number; top?: number; bottom?: number; y?: number };
export type ChartOverlayRef = React.MutableRefObject<{
  timeScale: () => {
    timeToCoordinate: (time: Candle["time"]) => number | null;
    subscribeVisibleLogicalRangeChange: (handler: () => void) => void;
    unsubscribeVisibleLogicalRangeChange: (handler: () => void) => void;
  };
} | null>;
export type SeriesOverlayRef = React.MutableRefObject<{
  coordinateToPrice: (coordinate: number) => number | null;
  priceToCoordinate: (price: number) => number | null;
} | null>;

const COLORS = {
  structure: "#8faadc", entry: "#4fd1a1", exit: "#f1b86b",
  stop_loss: "#ef6b73", take_profit: "#59b6e6",
} as const;
const isScored = (placement: SemanticPlacement | SemanticResult): placement is SemanticResult => "score" in placement;

function project(value: number, source: Candle[], target: Candle[]) {
  const range = (candles: Candle[]) => {
    const low = Math.min(...candles.map((candle) => candle.low));
    return { low, span: Math.max(Number.EPSILON, Math.max(...candles.map((candle) => candle.high)) - low) };
  };
  const from = range(source), to = range(target);
  return to.low + ((value - from.low) / from.span) * to.span;
}

export function buildValidationMarks(
  candidate: ValidationCandidate,
  references: StrategySnapshot[],
) {
  if (!candidate.semantic || !candidate.candles.length) return [];

  const placements = [
    ...candidate.semantic.results,
    ...candidate.semantic.execution,
  ];

  return placements.flatMap((placement): SemanticMark[] => {
    const reference = references[placement.referenceIndex];

    const annotation =
      reference?.annotations.find(
        (item) => item.id === placement.id,
      ) ??
      reference?.annotations.find(
        (item) => item.conceptId === placement.conceptId,
      );

    if (!reference || !annotation) return [];

    const last = candidate.candles.length - 1;
    const ratioLast = Math.max(1, last);

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
        candles: candidate.candles
          .slice(start, end + 1)
          .map(({ open, high, low, close }) => ({
            open,
            high,
            low,
            close,
          })),
      };
    } else if (annotation.kind === "zone") {
      projected = {
        ...annotation,
        startRatio: start / ratioLast,
        endRatio: end / ratioLast,
        priceHigh: project(
          annotation.priceHigh,
          reference.candles,
          candidate.candles,
        ),
        priceLow: project(
          annotation.priceLow,
          reference.candles,
          candidate.candles,
        ),
      };
    } else if (annotation.kind === "level") {
      projected = {
        ...annotation,
        startRatio: start / ratioLast,
        endRatio: end / ratioLast,
        price: project(
          annotation.price,
          reference.candles,
          candidate.candles,
        ),
      };
    } else {
      const candleIndex = start;
      const candle = candidate.candles[candleIndex];

      projected = {
        ...annotation,
        candleIndex,
        price: candle[annotation.priceAnchor],
      };
    }

    const scored = isScored(placement);
    const weak = scored && placement.score < 70;
    const required =
      scored && placement.importance === "required";

    return [{
      annotation: projected,
      score: scored ? placement.score : undefined,
      status: weak
        ? required
          ? "fail"
          : "weak"
        : "pass",
    }];
  });
}

export function SemanticMarksOverlay({ chartRef, seriesRef, data, marks, compact = false }: {
  chartRef: ChartOverlayRef;
  seriesRef: SeriesOverlayRef;
  data: Candle[];
  marks: SemanticMark[];
  compact?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [screenMarks, setScreenMarks] = useState<ScreenMark[]>([]);

  useEffect(() => {
    const chart = chartRef.current, root = rootRef.current;
    if (!chart || !root || !data.length) return;
    let frame: number | null = null;
    const paint = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const series = seriesRef.current;
        if (!series) return;
        const coordinate = (ratio: number) => {
          const index = Math.round(Math.max(0, Math.min(1, ratio)) * (data.length - 1));
          return chart.timeScale().timeToCoordinate(data[index].time) ?? 0;
        };
        const edge = (ratio: number, direction: -1 | 1) => {
          const index = Math.round(Math.max(0, Math.min(1, ratio)) * (data.length - 1));
          const neighbour = Math.max(0, Math.min(data.length - 1, index + direction));
          const fallback = Math.max(0, Math.min(data.length - 1, index - direction));
          const next = neighbour === index ? fallback : neighbour;
          const center = coordinate(ratio);
          const other = chart.timeScale().timeToCoordinate(data[next].time) ?? center;
          return center + direction * Math.max(3, Math.abs(other - center) / 2);
        };
        setScreenMarks(
  marks.flatMap((mark): ScreenMark[] => {
    const annotation = mark.annotation;
    const last = Math.max(1, data.length - 1);

    if (annotation.kind === "candle_group") {
      if (!annotation.candles.length) return [];

      const startIndex = data.findIndex((_, index) =>
        index + annotation.candles.length <= data.length &&
        annotation.candles.every((candle, offset) => {
          const chartCandle = data[index + offset];

          return (
            chartCandle.open === candle.open &&
            chartCandle.high === candle.high &&
            chartCandle.low === candle.low &&
            chartCandle.close === candle.close
          );
        }),
      );

      if (startIndex < 0) return [];

      const endIndex =
        startIndex + annotation.candles.length - 1;

      const priceHigh = Math.max(
        ...annotation.candles.map((candle) => candle.high),
      );

      const priceLow = Math.min(
        ...annotation.candles.map((candle) => candle.low),
      );

      return [{
        ...mark,
        left: edge(startIndex / last, -1),
        right: edge(endIndex / last, 1),
        top:
          series.priceToCoordinate(priceHigh) ?? 0,
        bottom:
          series.priceToCoordinate(priceLow) ?? 0,
      }];
    }

    if (annotation.kind === "zone") {
      const start = Math.min(
        annotation.startRatio,
        annotation.endRatio,
      );

      const end = Math.max(
        annotation.startRatio,
        annotation.endRatio,
      );

      return [{
        ...mark,
        left: coordinate(start),
        right: coordinate(end),
        top:
          series.priceToCoordinate(annotation.priceHigh) ?? 0,
        bottom:
          series.priceToCoordinate(annotation.priceLow) ?? 0,
      }];
    }

    if (annotation.kind === "marker") {
      const candleIndex = Math.max(
        0,
        Math.min(data.length - 1, annotation.candleIndex),
      );

      const candleRatio = candleIndex / last;

      return [{
        ...mark,
        left: coordinate(candleRatio),
        right: coordinate(candleRatio),
        y:
          series.priceToCoordinate(annotation.price) ?? 0,
      }];
    }

    const start = Math.min(
      annotation.startRatio,
      annotation.endRatio,
    );

    const end = Math.max(
      annotation.startRatio,
      annotation.endRatio,
    );

    return [{
      ...mark,
      left: coordinate(start),
      right: coordinate(end),
      y:
        series.priceToCoordinate(annotation.price) ?? 0,
    }];
  }),
);
      });
    };
    const observer = new ResizeObserver(paint);
    observer.observe(root);
    chart.timeScale().subscribeVisibleLogicalRangeChange(paint);
    paint();
    return () => {
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(paint);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [chartRef, data, marks, seriesRef]);

  if (!marks.length) return null;
  return <div ref={rootRef} style={{ position: "absolute", inset: 0, zIndex: 18, pointerEvents: "none", overflow: "hidden" }}>
    {screenMarks.map(({
  annotation,
  score,
  status,
  left,
  right,
  top = 0,
  bottom = 0,
  y = 0,
}) => {
  const color =
    status === "fail"
      ? "#ef6b73"
      : status === "weak"
        ? "#f1b86b"
        : COLORS[annotation.role];

  const label =
    `${annotation.label}${
      compact || score == null
        ? ""
        : ` · ${score.toFixed(0)}%`
    }`;

  const tag: React.CSSProperties = {
    position: "absolute",
    left: 3,
    top: 2,
    color,
    whiteSpace: "nowrap",
    fontSize: compact ? 7 : 9,
    background: "rgba(8,11,16,.84)",
    padding: "2px 3px",
  };

  if (annotation.kind === "candle_group") {
    return (
      <div
        key={annotation.id}
        style={{
          position: "absolute",
          left: Math.min(left, right),
          top: Math.min(top, bottom),
          width: Math.max(3, Math.abs(right - left)),
          height: Math.max(3, Math.abs(bottom - top)),
          border: `1px ${
            status === "weak" ? "dashed" : "solid"
          } ${color}`,
          background: `${color}1f`,
        }}
      >
        <span style={tag}>{label}</span>
      </div>
    );
  }

  if (annotation.kind === "zone") {
    return (
      <div
        key={annotation.id}
        style={{
          position: "absolute",
          left: Math.min(left, right),
          top: Math.min(top, bottom),
          width: Math.max(3, Math.abs(right - left)),
          height: Math.max(3, Math.abs(bottom - top)),
          border: `1px ${
            status === "weak" ? "dashed" : "solid"
          } ${color}`,
          background: `${color}1f`,
        }}
      >
        <span style={tag}>{label}</span>
      </div>
    );
  }

  if (annotation.kind === "marker") {
    return (
      <div
        key={annotation.id}
        style={{
          position: "absolute",
          left: left - 4,
          top: y - 4,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
        }}
      >
        <span style={{ ...tag, left: 11, top: -7 }}>
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      key={annotation.id}
      style={{
        position: "absolute",
        left: Math.min(left, right),
        top: y,
        width: Math.max(3, Math.abs(right - left)),
        borderTop: `1px dashed ${color}`,
      }}
    >
      <span style={{ ...tag, top: -14 }}>
        {label}
      </span>
    </div>
  );
})}
  </div>;
}
