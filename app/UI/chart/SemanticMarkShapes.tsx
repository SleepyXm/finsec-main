import {
  CSSProperties,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { Candle } from "@/app/components/types/charts";
import type { StrategyAnnotation } from "@/app/components/handlers/annotations";

export type SemanticMark = {
  annotation: StrategyAnnotation;
  score?: number;
  status?: "pass" | "weak" | "fail";
};

export type ScreenMark = SemanticMark & {
  left: number;
  right: number;
  top?: number;
  bottom?: number;
  y?: number;
};

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

type PointerHandler = (event: ReactPointerEvent<HTMLElement>) => void;

export function SemanticMarkShapes({
  marks,
  compact,
  interactive,
  hoveredId,
  draggingId,
  onHover,
  onLeave,
  beginDrag,
  finishDrag,
  nearestCandleIndex,
  rootRef,
  seriesRef,
  data,
  onMoveBoundary,
  onMoveMarker,
}: {
  marks: ScreenMark[];
  compact: boolean;
  interactive: boolean;
  hoveredId: string | null;
  draggingId: string | null;
  onHover: (id: string) => void;
  onLeave: (id: string) => void;
  beginDrag: (event: ReactPointerEvent<HTMLElement>, id: string) => void;
  finishDrag: PointerHandler;
  nearestCandleIndex: (clientX: number) => number;
  rootRef: RefObject<HTMLDivElement | null>;
  seriesRef: SeriesOverlayRef;
  data: Candle[];
  onMoveBoundary?: (
    annotationId: string,
    boundary: "start" | "end",
    candleIndex: number,
  ) => void;
  onMoveMarker?: (
    annotationId: string,
    candleIndex: number,
    priceAnchor: "open" | "high" | "low" | "close",
  ) => void;
}) {
  return marks.map(({
    annotation,
    score,
    status,
    left,
    right,
    top = 0,
    bottom = 0,
    y = 0,
  }) => {
    const color = status === "fail"
      ? "#ef6b73"
      : status === "weak" ? "#f1b86b" : COLORS[annotation.role];
    const label = `${annotation.label}${
      compact || score == null ? "" : ` · ${score.toFixed(0)}%`
    }`;
    const dragging = interactive && draggingId === annotation.id;
    const active = dragging || (interactive && hoveredId === annotation.id);
    const hoverEvents = interactive
      ? {
          onMouseEnter: () => onHover(annotation.id),
          onMouseLeave: () => onLeave(annotation.id),
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
              <BoundaryHandle
                side="start"
                color={color}
                active={active}
                dragging={dragging}
                onHover={() => onHover(annotation.id)}
                onLeave={() => onLeave(annotation.id)}
                onPointerDown={(event) => beginDrag(event, annotation.id)}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  onMoveBoundary?.(
                    annotation.id,
                    "start",
                    nearestCandleIndex(event.clientX),
                  );
                }}
                finishDrag={finishDrag}
              />
              <BoundaryHandle
                side="end"
                color={color}
                active={active}
                dragging={dragging}
                onHover={() => onHover(annotation.id)}
                onLeave={() => onLeave(annotation.id)}
                onPointerDown={(event) => beginDrag(event, annotation.id)}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  onMoveBoundary?.(
                    annotation.id,
                    "end",
                    nearestCandleIndex(event.clientX),
                  );
                }}
                finishDrag={finishDrag}
              />
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
          onPointerDown={(event) => interactive && beginDrag(event, annotation.id)}
          onPointerMove={(event) => {
            if (!interactive || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const root = rootRef.current;
            const series = seriesRef.current;
            if (!root || !series || !data.length) return;

            const candleIndex = nearestCandleIndex(event.clientX);
            const candle = data[candleIndex];
            const draggedPrice = series.coordinateToPrice(
              event.clientY - root.getBoundingClientRect().top,
            );
            if (draggedPrice == null || !Number.isFinite(draggedPrice)) return;
            const anchors = ["open", "high", "low", "close"] as const;
            const priceAnchor = anchors.reduce((closest, anchor) =>
              Math.abs(candle[anchor] - draggedPrice) <
              Math.abs(candle[closest] - draggedPrice)
                ? anchor
                : closest,
            );
            onMoveMarker?.(annotation.id, candleIndex, priceAnchor);
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
  });
}

function BoundaryHandle({
  side,
  color,
  active,
  dragging,
  onHover,
  onLeave,
  onPointerDown,
  onPointerMove,
  finishDrag,
}: {
  side: "start" | "end";
  color: string;
  active: boolean;
  dragging: boolean;
  onHover: () => void;
  onLeave: () => void;
  onPointerDown: PointerHandler;
  onPointerMove: PointerHandler;
  finishDrag: PointerHandler;
}) {
  const edge = side === "start" ? "left" : "right";
  return (
    <span
      data-boundary-hit-zone={side}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        position: "absolute",
        [edge]: -8,
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
          [edge]: 3,
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
  );
}
