"use client";

import { useState, type MutableRefObject, type PointerEvent } from "react";
import { cx } from "@/app/ui";
import styles from "./PositionOverlay.module.css";
import { EditableLine, PositionSeriesRef } from "./positionOverlayTypes";
import { formatPrice, priceAtPointer, usePriceY } from "./positionOverlayUtils";

export function EntryPriceLine({ price, orderTone, seriesRef, renderVersion }: {
  price: number;
  orderTone: "long" | "short";
  seriesRef: PositionSeriesRef;
  renderVersion?: number;
}) {
  const ref = usePriceY(price, seriesRef, renderVersion);
  return (
    <div
      ref={ref}
      className={cx(styles.entryLine, styles[`${orderTone}Order`])}
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
  renderVersion,
  onPreview,
  onCommit,
  onClear,
}: {
  field: EditableLine;
  label: string;
  value: number;
  isPreview: boolean;
  tone: "stop" | "take";
  seriesRef: PositionSeriesRef;
  overlayRef: MutableRefObject<HTMLDivElement | null>;
  renderVersion?: number;
  onPreview: (field: EditableLine, value: number) => void;
  onCommit: (field: EditableLine, value: number) => void;
  onClear: (field: EditableLine) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const lineRef = usePriceY(value, seriesRef, renderVersion);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();

    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    const next = priceAtPointer(e.clientY, overlayRef, seriesRef);
    if (next != null) onPreview(field, next);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;

    const next = priceAtPointer(e.clientY, overlayRef, seriesRef);
    if (next != null) onPreview(field, next);
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;

    const next = priceAtPointer(e.clientY, overlayRef, seriesRef);
    setDragging(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (next != null) onCommit(field, next);
  }

  return (
    <div
      ref={lineRef}
      className={cx(
        styles.priceLine,
        styles[tone],
        dragging && styles.dragging,
        isPreview && styles.preview
      )}
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
