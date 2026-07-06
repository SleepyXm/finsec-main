"use client";

import { useState } from "react";
import type { CSSProperties, MutableRefObject, PointerEvent } from "react";
import styles from "./PositionOverlay.module.css";
import type { EditableLine } from "./positionOverlayTypes";
import { cx, formatPrice, normalisePrice } from "./positionOverlayUtils";

type YStyle = CSSProperties & { "--po-y": string };

function yStyle(y: number): YStyle {
  return { "--po-y": `${y}px` };
}

export function EntryPriceLine({ y, orderTone }: { y: number; orderTone: "long" | "short" }) {
  return (
    <div
      className={cx(styles.entryLine, styles[`${orderTone}Order`])}
      style={yStyle(y)}
    />
  );
}

export function DraggablePriceLine({
  field,
  label,
  value,
  isPreview,
  tone,
  seriesRef,
  overlayRef,
  onPreview,
  onCommit,
  onClear,
}: {
  field: EditableLine;
  label: string;
  value: number;
  isPreview: boolean;
  tone: "stop" | "take";
  seriesRef: MutableRefObject<any>;
  overlayRef: MutableRefObject<HTMLDivElement | null>;
  onPreview: (field: EditableLine, value: number) => void;
  onCommit: (field: EditableLine, value: number) => void;
  onClear: (field: EditableLine) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const y = seriesRef.current?.priceToCoordinate(value);

  if (y == null || isNaN(y)) return null;

  function priceFromPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const price = seriesRef.current?.coordinateToPrice(e.clientY - rect.top);
    if (price == null || !Number.isFinite(price)) return null;

    return normalisePrice(price);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();

    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    const next = priceFromPointer(e);
    if (next != null) onPreview(field, next);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;

    const next = priceFromPointer(e);
    if (next != null) onPreview(field, next);
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;

    const next = priceFromPointer(e);
    setDragging(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (next != null) onCommit(field, next);
  }

  return (
    <div
      className={cx(
        styles.priceLine,
        styles[tone],
        dragging && styles.dragging,
        isPreview && styles.preview
      )}
      style={yStyle(y)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className={styles.priceLineRule} />

      <div className={styles.priceLineBadge}>
        <span className={styles.badgeLabel}>
          {label}
          {isPreview ? " preview" : ""}
        </span>
        <span className={styles.priceLineValue}>{formatPrice(value)}</span>

        {!isPreview && (
          <button
            type="button"
            className={styles.clearLineButton}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClear(field);
            }}
          >
            x
          </button>
        )}
      </div>
    </div>
  );
}
