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

export function buildValidationMarks(candidate: ValidationCandidate, references: StrategySnapshot[]) {
  if (!candidate.semantic) return [];
  const placements = [
    ...candidate.semantic.results,
    ...candidate.semantic.execution,
  ];
  return placements.flatMap((placement): SemanticMark[] => {
    const reference = references[placement.referenceIndex];
    const annotation = reference?.annotations.find((item) => item.id === placement.id)
      ?? reference?.annotations.find((item) => item.conceptId === placement.conceptId);
    if (!reference || !annotation) return [];
    const projected = { ...annotation, startRatio: placement.matchedStartRatio, endRatio: placement.matchedEndRatio };
    if (annotation.kind === "candle_group") {
      const last = candidate.candles.length - 1;
      const start = Math.round(Math.min(placement.matchedStartRatio, placement.matchedEndRatio) * last);
      const end = Math.round(Math.max(placement.matchedStartRatio, placement.matchedEndRatio) * last);
      const candles = candidate.candles.slice(start, end + 1);
      projected.priceHigh = Math.max(...candles.map((candle) => candle.high));
      projected.priceLow = Math.min(...candles.map((candle) => candle.low));
    } else {
      if (annotation.priceHigh != null) projected.priceHigh = project(annotation.priceHigh, reference.candles, candidate.candles);
      if (annotation.priceLow != null) projected.priceLow = project(annotation.priceLow, reference.candles, candidate.candles);
    }
    if (annotation.kind === "marker" && annotation.priceAnchor) {
      const candleIndex = Math.round(placement.matchedStartRatio * (candidate.candles.length - 1));
      projected.candleIndex = candleIndex;
      projected.price = candidate.candles[candleIndex][annotation.priceAnchor];
    } else if (annotation.price != null) {
      projected.price = project(annotation.price, reference.candles, candidate.candles);
    }
    const scored = isScored(placement);
    const weak = scored && placement.score < 70;
    const required = scored && placement.importance === "required";
    return [{
      annotation: projected,
      score: scored ? placement.score : undefined,
      status: weak ? required ? "fail" : "weak" : "pass",
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
        setScreenMarks(marks.map((mark) => {
          const start = Math.min(mark.annotation.startRatio, mark.annotation.endRatio);
          const end = Math.max(mark.annotation.startRatio, mark.annotation.endRatio);
          const candleGroup = mark.annotation.kind === "candle_group";
          return {
            ...mark,
            left: candleGroup ? edge(start, -1) : coordinate(start),
            right: candleGroup ? edge(end, 1) : coordinate(end),
            top: mark.annotation.priceHigh == null ? undefined : series.priceToCoordinate(mark.annotation.priceHigh) ?? 0,
            bottom: mark.annotation.priceLow == null ? undefined : series.priceToCoordinate(mark.annotation.priceLow) ?? 0,
            y: mark.annotation.price == null ? undefined : series.priceToCoordinate(mark.annotation.price) ?? 0,
          };
        }));
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
    {screenMarks.map(({ annotation, score, status, left, right, top = 0, bottom = 0, y = 0 }) => {
      const color = status === "fail" ? "#ef6b73" : status === "weak" ? "#f1b86b" : COLORS[annotation.role];
      const label = `${annotation.label}${compact || score == null ? "" : ` · ${score.toFixed(0)}%`}`;
      const tag: React.CSSProperties = { position: "absolute", left: 3, top: 2, color, whiteSpace: "nowrap", fontSize: compact ? 7 : 9, background: "rgba(8,11,16,.84)", padding: "2px 3px" };
      if ((annotation.kind === "candle_group" || annotation.kind === "zone") && annotation.priceHigh != null && annotation.priceLow != null) return <div key={annotation.id} style={{ position: "absolute", left: Math.min(left, right), top: Math.min(top, bottom), width: Math.max(3, Math.abs(right - left)), height: Math.max(3, Math.abs(bottom - top)), border: `1px ${status === "weak" ? "dashed" : "solid"} ${color}`, background: `${color}1f` }}><span style={tag}>{label}</span></div>;
      if (annotation.price == null) return null;
      if (annotation.kind === "marker") return <div key={annotation.id} style={{ position: "absolute", left: left - 4, top: y - 4, width: 8, height: 8, borderRadius: "50%", background: color }}><span style={{ ...tag, left: 11, top: -7 }}>{label}</span></div>;
      return <div key={annotation.id} style={{ position: "absolute", left: Math.min(left, right), top: y, width: Math.max(3, Math.abs(right - left)), borderTop: `1px dashed ${color}` }}><span style={{ ...tag, top: -14 }}>{label}</span></div>;
    })}
  </div>;
}
