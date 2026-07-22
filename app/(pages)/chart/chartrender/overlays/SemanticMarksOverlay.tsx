"use client";

import { MutableRefObject, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import type {
  CandidateBoundaryAdjustment,
} from "../../SimilaritySearch/validation";
import { Candle } from "@/app/components/types/charts";
import {
  SemanticMarkShapes,
  type ScreenMark,
  type SemanticMark,
  type SeriesOverlayRef,
} from "@/app/UI";

export type ChartOverlayRef = MutableRefObject<{
  timeScale: () => {
    timeToCoordinate: (time: Candle["time"]) => number | null;
    subscribeVisibleLogicalRangeChange: (handler: () => void) => void;
    unsubscribeVisibleLogicalRangeChange: (handler: () => void) => void;
  };
} | null>;

export function SemanticMarksOverlay({
  chartRef,
  seriesRef,
  data,
  marks,
  compact = false,
  interactive = false,
  onAdjustBoundary,
}: {
  chartRef: ChartOverlayRef;
  seriesRef: SeriesOverlayRef;
  data: Candle[];
  marks: SemanticMark[];
  compact?: boolean;
  interactive?: boolean;
  onAdjustBoundary?: (adjustment: CandidateBoundaryAdjustment) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [screenMarks, setScreenMarks] = useState<ScreenMark[]>([]);
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null);
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null);

  const nearestCandleIndex = (clientX: number) => {
    const root = rootRef.current;
    const chart = chartRef.current;

    if (!root || !chart || !data.length) return 0;

    const x = clientX - root.getBoundingClientRect().left;

    return data.reduce(
      (best, candle, index) => {
        const coordinate = chart.timeScale().timeToCoordinate(candle.time);
        if (coordinate == null) return best;

        const distance = Math.abs(coordinate - x);
        return distance < best.distance ? { index, distance } : best;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    ).index;
  };

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, annotationId: string) => {
    event.preventDefault();
    event.stopPropagation();

    setDraggingAnnotationId(annotationId);
    setHoveredAnnotationId(annotationId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDraggingAnnotationId(null);
  };

  const leaveHover = (annotationId: string) => {
    if (draggingAnnotationId !== annotationId) {
      setHoveredAnnotationId((current) => current === annotationId ? null : current);
    }
  };

  useEffect(() => {
    const chart = chartRef.current;
    const root = rootRef.current;

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

        setScreenMarks(marks.flatMap((mark): ScreenMark[] => {
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

            const endIndex = startIndex + annotation.candles.length - 1;
            const priceHigh = Math.max(...annotation.candles.map((candle) => candle.high));
            const priceLow = Math.min(...annotation.candles.map((candle) => candle.low));

            return [{
              ...mark,
              left: edge(startIndex / last, -1),
              right: edge(endIndex / last, 1),
              top: series.priceToCoordinate(priceHigh) ?? 0,
              bottom: series.priceToCoordinate(priceLow) ?? 0,
            }];
          }

          if (annotation.kind === "zone") {
            const start = Math.min(annotation.startRatio, annotation.endRatio);
            const end = Math.max(annotation.startRatio, annotation.endRatio);

            return [{
              ...mark,
              left: coordinate(start),
              right: coordinate(end),
              top: series.priceToCoordinate(annotation.priceHigh) ?? 0,
              bottom: series.priceToCoordinate(annotation.priceLow) ?? 0,
            }];
          }

          if (annotation.kind === "marker") {
            const candleIndex = Math.max(0, Math.min(data.length - 1, annotation.candleIndex));
            const candleRatio = candleIndex / last;

            return [{
              ...mark,
              left: coordinate(candleRatio),
              right: coordinate(candleRatio),
              y: series.priceToCoordinate(annotation.price) ?? 0,
            }];
          }

          const start = Math.min(annotation.startRatio, annotation.endRatio);
          const end = Math.max(annotation.startRatio, annotation.endRatio);

          return [{
            ...mark,
            left: coordinate(start),
            right: coordinate(end),
            y: series.priceToCoordinate(annotation.price) ?? 0,
          }];
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
  }, [chartRef, seriesRef, data, marks]);

  if (!marks.length) return null;

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 18,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <SemanticMarkShapes
        marks={screenMarks}
        compact={compact}
        interactive={interactive}
        hoveredId={hoveredAnnotationId}
        draggingId={draggingAnnotationId}
        onHover={setHoveredAnnotationId}
        onLeave={leaveHover}
        beginDrag={beginDrag}
        finishDrag={finishDrag}
        nearestCandleIndex={nearestCandleIndex}
        rootRef={rootRef}
        seriesRef={seriesRef}
        data={data}
        onMoveBoundary={(annotationId, boundary, candleIndex) =>
          onAdjustBoundary?.({
            target: "semantic",
            annotationId,
            boundary,
            candleIndex,
          })
        }
        onMoveMarker={(annotationId, candleIndex, priceAnchor) =>
          onAdjustBoundary?.({
            target: "marker",
            annotationId,
            candleIndex,
            priceAnchor,
          })
        }
      />
    </div>
  );
}
