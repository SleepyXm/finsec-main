"use client";

import { CSSProperties, MutableRefObject, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import type { Candle } from "@/app/components/types/charts";
import type {
  CandidateBoundaryAdjustment,
  SemanticMark,
} from "@/app/features/StrategyEngine/types";

export type { SemanticMark } from "@/app/features/StrategyEngine/types";

type ScreenMark = SemanticMark & {
  left: number;
  right: number;
  top?: number;
  bottom?: number;
  y?: number;
};

export type ChartOverlayRef = MutableRefObject<{
  timeScale: () => {
    timeToCoordinate: (time: Candle["time"]) => number | null;
    subscribeVisibleLogicalRangeChange: (handler: () => void) => void;
    unsubscribeVisibleLogicalRangeChange: (handler: () => void) => void;
  };
} | null>;

export type SeriesOverlayRef = MutableRefObject<{
  coordinateToPrice: (coordinate: number) => number | null;
  priceToCoordinate: (price: number) => number | null;
} | null>;

const COLORS = {
  structure: "#8faadc",
  entry: "#4fd1a1",
  exit: "#f1b86b",
  stop_loss: "#ef6b73",
  take_profit: "#59b6e6",
} as const;

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
            const startIndex = Math.max(
              0,
              Math.min(data.length - 1, annotation.startIndex),
            );
            const endIndex = Math.max(
              startIndex,
              Math.min(data.length - 1, annotation.endIndex),
            );
            const selectedCandles = data.slice(
              startIndex,
              endIndex + 1,
            );

            if (!selectedCandles.length) return [];

            const priceHigh = Math.max(
              ...selectedCandles.map((candle) => candle.high),
            );
            const priceLow = Math.min(
              ...selectedCandles.map((candle) => candle.low),
            );

            return [{
              ...mark,
              left: edge(startIndex / last, -1),
              right: edge(endIndex / last, 1),
              top: series.priceToCoordinate(priceHigh) ?? 0,
              bottom: series.priceToCoordinate(priceLow) ?? 0,
            }];
          }

          if (annotation.kind === "zone") {
            const start =
              Math.min(annotation.startIndex, annotation.endIndex) /
              last;
            const end =
              Math.max(annotation.startIndex, annotation.endIndex) /
              last;

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

          const start =
            Math.min(annotation.startIndex, annotation.endIndex) /
            last;
          const end =
            Math.max(annotation.startIndex, annotation.endIndex) /
            last;

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

        const label = `${annotation.label}${
          compact || score == null ? "" : ` · ${score.toFixed(0)}%`
        }`;

        const hovered = interactive && hoveredAnnotationId === annotation.id;
        const dragging = interactive && draggingAnnotationId === annotation.id;
        const active = hovered || dragging;

        const hoverEvents = interactive
          ? {
              onMouseEnter: () => setHoveredAnnotationId(annotation.id),
              onMouseLeave: () => {
                if (draggingAnnotationId !== annotation.id) {
                  setHoveredAnnotationId((current) => (
                    current === annotation.id ? null : current
                  ));
                }
              },
            }
          : {};

        const tag: CSSProperties = {
          position: "absolute",
          left: 3,
          top: 2,
          color,
          whiteSpace: "nowrap",
          fontSize: compact ? 7 : 9,
          background: active ? "rgba(8,11,16,.98)" : "rgba(8,11,16,.84)",
          padding: "2px 3px",
          pointerEvents: "none",
        };

        if (annotation.kind === "candle_group") {
          return (
            <div
              key={annotation.id}
              data-annotation-id={annotation.id}
              data-annotation-kind={annotation.kind}
              style={{
                position: "absolute",
                left: Math.min(left, right),
                top: Math.min(top, bottom),
                width: Math.max(3, Math.abs(right - left)),
                height: Math.max(3, Math.abs(bottom - top)),
                border: `1px ${status === "weak" ? "dashed" : "solid"} ${color}`,
                background: `${color}${active ? "32" : "1f"}`,
                boxShadow: active ? `0 0 0 1px ${color}, 0 0 12px ${color}33` : undefined,
                pointerEvents: "none",
                userSelect: "none",
                zIndex: 2,
              }}
            >
              <span style={tag}>{label}</span>

              {interactive && (
                <>
                  <span
                    data-boundary-hit-zone="start"
                    onMouseEnter={() => setHoveredAnnotationId(annotation.id)}
                    onMouseLeave={() => {
                      if (draggingAnnotationId !== annotation.id) {
                        setHoveredAnnotationId((current) => (
                          current === annotation.id ? null : current
                        ));
                      }
                    }}
                    onPointerDown={(event) => beginDrag(event, annotation.id)}
                    onPointerMove={(event) => {
                      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

                      onAdjustBoundary?.({
                        target: "semantic",
                        annotationId: annotation.id,
                        boundary: "start",
                        candleIndex: nearestCandleIndex(event.clientX),
                      });
                    }}
                    onPointerUp={finishDrag}
                    onPointerCancel={finishDrag}
                    style={{
                      position: "absolute",
                      left: -8,
                      top: 0,
                      bottom: 0,
                      width: 16,
                      cursor: "ew-resize",
                      pointerEvents: "auto",
                      touchAction: "none",
                      zIndex: 6,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: 3,
                        top: "50%",
                        width: 9,
                        height: 28,
                        transform: "translateY(-50%)",
                        border: `1px solid ${color}`,
                        background: "rgba(8,11,16,.96)",
                        opacity: active ? 1 : 0,
                        transition: dragging ? undefined : "opacity 100ms ease",
                        pointerEvents: "none",
                      }}
                    />
                  </span>

                  <span
                    data-boundary-hit-zone="end"
                    onMouseEnter={() => setHoveredAnnotationId(annotation.id)}
                    onMouseLeave={() => {
                      if (draggingAnnotationId !== annotation.id) {
                        setHoveredAnnotationId((current) => (
                          current === annotation.id ? null : current
                        ));
                      }
                    }}
                    onPointerDown={(event) => beginDrag(event, annotation.id)}
                    onPointerMove={(event) => {
                      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

                      onAdjustBoundary?.({
                        target: "semantic",
                        annotationId: annotation.id,
                        boundary: "end",
                        candleIndex: nearestCandleIndex(event.clientX),
                      });
                    }}
                    onPointerUp={finishDrag}
                    onPointerCancel={finishDrag}
                    style={{
                      position: "absolute",
                      right: -8,
                      top: 0,
                      bottom: 0,
                      width: 16,
                      cursor: "ew-resize",
                      pointerEvents: "auto",
                      touchAction: "none",
                      zIndex: 6,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        right: 3,
                        top: "50%",
                        width: 9,
                        height: 28,
                        transform: "translateY(-50%)",
                        border: `1px solid ${color}`,
                        background: "rgba(8,11,16,.96)",
                        opacity: active ? 1 : 0,
                        transition: dragging ? undefined : "opacity 100ms ease",
                        pointerEvents: "none",
                      }}
                    />
                  </span>
                </>
              )}
            </div>
          );
        }

        if (annotation.kind === "marker") {
          return (
            <div
              {...hoverEvents}
              key={annotation.id}
              data-annotation-id={annotation.id}
              data-annotation-kind={annotation.kind}
              onPointerDown={(event) => {
                if (interactive) beginDrag(event, annotation.id);
              }}
              onPointerMove={(event) => {
                if (
                  !interactive ||
                  !event.currentTarget.hasPointerCapture(event.pointerId)
                ) {
                  return;
                }

                const root = rootRef.current;
                const series = seriesRef.current;

                if (!root || !series || !data.length) return;

                const candleIndex = nearestCandleIndex(event.clientX);
                const candle = data[candleIndex];
                const pointerY = event.clientY - root.getBoundingClientRect().top;
                const draggedPrice = series.coordinateToPrice(pointerY);

                if (draggedPrice == null || !Number.isFinite(draggedPrice)) return;

                const anchors = ["open", "high", "low", "close"] as const;
                const priceAnchor = anchors.reduce((closest, anchor) => (
                  Math.abs(candle[anchor] - draggedPrice) <
                  Math.abs(candle[closest] - draggedPrice)
                    ? anchor
                    : closest
                ));

                onAdjustBoundary?.({
                  target: "marker",
                  annotationId: annotation.id,
                  candleIndex,
                  priceAnchor,
                });
              }}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              style={{
                position: "absolute",
                left: left - 14,
                top: y - 14,
                width: 28,
                height: 28,
                pointerEvents: interactive ? "auto" : "none",
                cursor: interactive ? (dragging ? "grabbing" : "grab") : undefined,
                touchAction: "none",
                userSelect: "none",
                zIndex: 20,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 9,
                  top: 9,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  boxShadow: active
                    ? `0 0 0 3px ${color}55, 0 0 10px ${color}`
                    : "0 0 0 2px rgba(8,11,16,.85)",
                  pointerEvents: "none",
                }}
              />

              <span style={{ ...tag, left: 27, top: 7 }}>{label}</span>
            </div>
          );
        }

        if (annotation.kind === "zone") {
          return (
            <div
              {...hoverEvents}
              key={annotation.id}
              style={{
                position: "absolute",
                left: Math.min(left, right),
                top: Math.min(top, bottom),
                width: Math.max(3, Math.abs(right - left)),
                height: Math.max(3, Math.abs(bottom - top)),
                border: `1px ${status === "weak" ? "dashed" : "solid"} ${color}`,
                background: `${color}${active ? "32" : "1f"}`,
                pointerEvents: interactive ? "auto" : "none",
                zIndex: active ? 4 : 3,
              }}
            >
              <span style={tag}>{label}</span>
            </div>
          );
        }

        return (
          <div
            {...hoverEvents}
            key={annotation.id}
            style={{
              position: "absolute",
              left: Math.min(left, right),
              top: y - 5,
              width: Math.max(3, Math.abs(right - left)),
              height: 10,
              pointerEvents: interactive ? "auto" : "none",
              zIndex: active ? 4 : 3,
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 5,
                borderTop: `${active ? 2 : 1}px dashed ${color}`,
                pointerEvents: "none",
              }}
            />

            <span style={{ ...tag, top: -9 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
