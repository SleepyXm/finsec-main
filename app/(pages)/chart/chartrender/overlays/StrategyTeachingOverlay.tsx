"use client";

import { useState } from "react";
import { useChartContext } from "@/app/(pages)/chart/chartcontext";
import { StrategyAnnotation } from "@/app/components/handlers/annotations";
import { Candle } from "@/app/components/types/charts";
import { theme } from "@/app/UI";
import { ChartOverlayRef, SemanticMarksOverlay, SeriesOverlayRef } from "./SemanticMarksOverlay";

type Point = { x: number; y: number };
const annotationId = () => globalThis.crypto?.randomUUID?.() ?? `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const conceptId = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function StrategyTeachingOverlay({ chartRef, seriesRef, data }: {
  chartRef: ChartOverlayRef;
  seriesRef: SeriesOverlayRef;
  data: Candle[];
}) {
  const { strategyTeaching, setStrategyTeachingAnnotations } = useChartContext();
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
  const ratio = (index: number) => index / Math.max(1, data.length - 1);
  const price = (y: number) => Number(seriesRef.current?.coordinateToPrice(y));

  const add = (from: Point, to: Point) => {
  const first = Math.min(nearestIndex(from.x), nearestIndex(to.x));
  const last = Math.max(nearestIndex(from.x), nearestIndex(to.x));
  const execution = ["entry", "exit", "stop_loss", "take_profit"].includes(tool);

  const base = {
    id: annotationId(),
    conceptId: conceptId(activeLabel),
    label: activeLabel,
    role: (execution ? tool : "structure") as StrategyAnnotation["role"],
    importance,
    trigger,
  };

  let annotation: StrategyAnnotation;

  if (tool === "candle_group") {
    annotation = {
      ...base,
      kind: "candle_group",
      candles: data
        .slice(first, last + 1)
        .map(({ open, high, low, close }) => ({
          open,
          high,
          low,
          close,
        })),
    };
  } else if (tool === "zone") {
    annotation = {
      ...base,
      kind: "zone",
      startRatio: ratio(first),
      endRatio: ratio(last),
      priceHigh: Math.max(price(from.y), price(to.y)),
      priceLow: Math.min(price(from.y), price(to.y)),
    };
  } else if (tool === "level") {
    annotation = {
      ...base,
      kind: "level",
      startRatio: 0,
      endRatio: 1,
      price: price(to.y),
    };
  } else {
    const candleIndex = nearestIndex(to.x);
    const candle = data[candleIndex];
    const clickedPrice = price(to.y);
    const anchors = ["open", "high", "low", "close"] as const;

    const priceAnchor = anchors.reduce((closest, anchor) =>
      Math.abs(candle[anchor] - clickedPrice) <
      Math.abs(candle[closest] - clickedPrice)
        ? anchor
        : closest,
    );

    annotation = {
      ...base,
      kind: "marker",
      candleIndex,
      priceAnchor,
      price: candle[priceAnchor],
    };
  }

  setStrategyTeachingAnnotations([...annotations, annotation]);
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
