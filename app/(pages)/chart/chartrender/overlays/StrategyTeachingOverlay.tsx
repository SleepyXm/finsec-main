"use client";

import { useState } from "react";
import type { Candle } from "@/app/components/types/charts";
import { createTeachingAnnotation } from "@/app/features/StrategyEngine/controls";
import type {
  StrategyAnnotation,
  StrategyTeachingState,
} from "@/app/features/StrategyEngine/types";
import { theme } from "@/app/UI";
import { ChartOverlayRef, SemanticMarksOverlay, SeriesOverlayRef } from "./SemanticMarksOverlay";

type Point = { x: number; y: number };
const annotationId = () => globalThis.crypto?.randomUUID?.() ?? `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function StrategyTeachingOverlay({
  chartRef,
  seriesRef,
  data,
  strategyTeaching,
  setStrategyTeachingAnnotations,
}: {
  chartRef: ChartOverlayRef;
  seriesRef: SeriesOverlayRef;
  data: Candle[];
  strategyTeaching: StrategyTeachingState | null;
  setStrategyTeachingAnnotations: (
    annotations: StrategyAnnotation[],
  ) => void;
}) {
  const [start, setStart] = useState<Point | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  if (!strategyTeaching || !data.length) return null;
  const { tool, label, importance, trigger, annotations } = strategyTeaching;
  const activeLabel = label.trim() || tool.replace(/_/g, " ");
  const point = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const nearestIndex = (x: number) => data.reduce((best, candle, index) => {
    const coordinate = chartRef.current?.timeScale().timeToCoordinate(candle.time);
    return coordinate != null && Math.abs(coordinate - x) < best.distance
      ? { index, distance: Math.abs(coordinate - x) } : best;
  }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
  const price = (y: number) => Number(seriesRef.current?.coordinateToPrice(y));

  const add = (from: Point, to: Point) => {
    const fromIndex = nearestIndex(from.x);
    const toIndex = nearestIndex(to.x);
    const execution = [
      "entry",
      "exit",
      "stop_loss",
      "take_profit",
    ].includes(tool);
    let markerAnchor:
      | "open"
      | "high"
      | "low"
      | "close"
      | undefined;

    if (execution) {
      const candle = data[toIndex];
      const clickedPrice = price(to.y);
      const anchors = [
        "open",
        "high",
        "low",
        "close",
      ] as const;

      markerAnchor = anchors.reduce((closest, anchor) =>
        Math.abs(candle[anchor] - clickedPrice) <
        Math.abs(candle[closest] - clickedPrice)
          ? anchor
          : closest,
      );
    }

    const annotation = createTeachingAnnotation({
      id: annotationId(),
      teaching: {
        tool,
        label,
        importance,
        trigger,
      },
      candles: data,
      firstIndex: execution
        ? toIndex
        : Math.min(fromIndex, toIndex),
      lastIndex: execution
        ? toIndex
        : Math.max(fromIndex, toIndex),
      fromPrice: price(from.y),
      toPrice: price(to.y),
      markerAnchor,
    });

    setStrategyTeachingAnnotations([
      ...annotations,
      annotation,
    ]);
  };

  return <div
    style={{ position: "absolute", inset: 0, zIndex: 20, cursor: tool === "level" ? "row-resize" : "crosshair" }}
    onMouseDown={(event) => { const value = point(event); setStart(value); setPointer(value); }}
    onMouseMove={(event) => start && setPointer(point(event))}
    onMouseUp={(event) => { if (start) add(start, point(event)); setStart(null); setPointer(null); }}
    onMouseLeave={() => { setStart(null); setPointer(null); }}
  >
    <SemanticMarksOverlay chartRef={chartRef} seriesRef={seriesRef} data={data} marks={annotations.map((annotation) => ({ annotation }))} />
    <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", padding: "7px 10px", color: theme.dark.text, background: "rgba(14,17,23,.94)", border: `1px solid ${theme.dark.accentBorder}`, fontSize: 9, pointerEvents: "none" }}>
      TEACHING · {strategyTeaching.snapshot.symbol} · {tool.replace(/_/g, " ")} · {activeLabel}
    </div>
    {start && pointer && (tool === "candle_group" || tool === "zone") && <div style={{ position: "absolute", left: Math.min(start.x, pointer.x), top: Math.min(start.y, pointer.y), width: Math.abs(pointer.x - start.x), height: Math.abs(pointer.y - start.y), border: `1px dashed ${theme.dark.accent}`, background: theme.dark.accentSoft }} />}
    {start && pointer && tool === "level" && <div style={{ position: "absolute", left: 0, right: 0, top: pointer.y, borderTop: `1px dashed ${theme.dark.accent}` }} />}
  </div>;
}
