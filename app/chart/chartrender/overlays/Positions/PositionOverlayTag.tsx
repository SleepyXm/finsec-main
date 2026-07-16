"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CSSProperties, MutableRefObject, PointerEvent } from "react";
import { DraggablePriceLine, EntryPriceLine } from "./PositionOverlayLine";
import styles from "./PositionOverlay.module.css";
import { Draft, EditableLine, PositionPatch, PositionWithExtras } from "./positionOverlayTypes";
import { buildPatch, cx, draftFromPosition, draftMatches, formatPrice, getDefaultLinePrice, normalisePrice } from "./positionOverlayUtils";

type YStyle = CSSProperties & { "--po-y": string };

function yStyle(y: number): YStyle {
  return { "--po-y": `${y}px` };
}

export function PositionTag({
  position,
  livePnL,
  isLong,
  y,
  seriesRef,
  overlayRef,
  onClose,
  onUpdate,
}: {
  position: PositionWithExtras;
  livePnL: number;
  isLong: boolean;
  y: number;
  seriesRef: MutableRefObject<any>;
  overlayRef: MutableRefObject<HTMLDivElement | null>;
  onClose?: () => void;
  onUpdate?: (patch: PositionPatch) => void | Promise<void>;
}) {
  const dragStartRef = useRef<{ field: EditableLine; y: number; moved: boolean } | null>(null);
  const persisted = useMemo(
    () => draftFromPosition(position),
    [
      position.trade_id,
      position.order_type,
      position.price,
      position.entry_price,
      position.stop_loss,
      position.take_profit,
    ]
  );

  const [activeField, setActiveField] = useState<EditableLine | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(persisted);

  useEffect(() => {
    setDraft(persisted);
    setError(null);
  }, [persisted]);

  const dirty = !draftMatches(persisted, draft);
  const defaultLines = useMemo(
    () => ({
      stop_loss: getDefaultLinePrice(position, "stop_loss", isLong),
      take_profit: getDefaultLinePrice(position, "take_profit", isLong),
    }),
    [position.entry_price, isLong]
  );

  const stopLossValue = draft.stop_loss ?? defaultLines.stop_loss;
  const takeProfitValue = draft.take_profit ?? defaultLines.take_profit;
  const activeValue =
    activeField === "stop_loss"
      ? stopLossValue
      : activeField === "take_profit"
        ? takeProfitValue
        : null;
  const activeY =
    activeValue == null ? null : seriesRef.current?.priceToCoordinate(activeValue);
  const orderTone = isLong ? "long" : "short";

  function updateDraftLine(field: EditableLine, value: number | null) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function priceFromPointer(e: PointerEvent<HTMLElement>) {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const price = seriesRef.current?.coordinateToPrice(e.clientY - rect.top);
    if (price == null || !Number.isFinite(price)) return null;

    return normalisePrice(price);
  }

  function startRiskDrag(field: EditableLine, e: PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    setActiveField(field);
    setError(null);
    dragStartRef.current = { field, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveRiskDrag(field: EditableLine, e: PointerEvent<HTMLButtonElement>) {
    const drag = dragStartRef.current;
    if (!drag || drag.field !== field) return;

    if (!drag.moved && Math.abs(e.clientY - drag.y) < 3) return;
    drag.moved = true;

    const price = priceFromPointer(e);
    if (price != null) updateDraftLine(field, price);
  }

  function endRiskDrag(field: EditableLine, e: PointerEvent<HTMLButtonElement>) {
    const drag = dragStartRef.current;
    if (!drag || drag.field !== field) return;

    if (drag.moved) {
      const price = priceFromPointer(e);
      if (price != null) updateDraftLine(field, price);
    }

    dragStartRef.current = null;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }

  async function acceptDraft() {
    if (!dirty) {
      setActiveField(null);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onUpdate?.(buildPatch(persisted, draft));
      setActiveField(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update trade");
    } finally {
      setSaving(false);
    }
  }

  function cancelDraft() {
    setDraft(persisted);
    setError(null);
    setActiveField(null);
  }

  return (
    <>
      <EntryPriceLine y={y} orderTone={orderTone} />

      {activeField === "stop_loss" && (
        <DraggablePriceLine
          field="stop_loss"
          label="SL"
          value={stopLossValue}
          isPreview={draft.stop_loss == null}
          tone="stop"
          seriesRef={seriesRef}
          overlayRef={overlayRef}
          onPreview={updateDraftLine}
          onCommit={(field, value) => updateDraftLine(field, normalisePrice(value))}
          onClear={(field) => updateDraftLine(field, null)}
        />
      )}

      {activeField === "take_profit" && (
        <DraggablePriceLine
          field="take_profit"
          label="TP"
          value={takeProfitValue}
          isPreview={draft.take_profit == null}
          tone="take"
          seriesRef={seriesRef}
          overlayRef={overlayRef}
          onPreview={updateDraftLine}
          onCommit={(field, value) => updateDraftLine(field, normalisePrice(value))}
          onClear={(field) => updateDraftLine(field, null)}
        />
      )}

      <div
        className={cx(
          styles.tag,
          styles[`${orderTone}Order`],
          activeField && styles.tagEditing
        )}
        style={yStyle(y)}
      >
        <div className={styles.corner} />
        <div className={styles.tagMeta}>
          <span className={styles.tagTitle}>
            <span className={styles.side}>{position.side}</span> / {position.symbol}
          </span>
          <span className={cx(styles.pnl, livePnL >= 0 ? styles.positive : styles.negative)}>
            {livePnL >= 0 ? "+" : ""}${livePnL.toFixed(2)}
          </span>
        </div>

        <div className={styles.riskControls}>
          <button
            type="button"
            className={cx(
              styles.riskButton,
              styles.take,
              activeField === "take_profit" && styles.riskButtonActive
            )}
            onClick={() => setActiveField("take_profit")}
            onPointerDown={(e) => startRiskDrag("take_profit", e)}
            onPointerMove={(e) => moveRiskDrag("take_profit", e)}
            onPointerUp={(e) => endRiskDrag("take_profit", e)}
          >
            TP
          </button>
          <button
            type="button"
            className={cx(
              styles.riskButton,
              styles.stop,
              activeField === "stop_loss" && styles.riskButtonActive
            )}
            onClick={() => setActiveField("stop_loss")}
            onPointerDown={(e) => startRiskDrag("stop_loss", e)}
            onPointerMove={(e) => moveRiskDrag("stop_loss", e)}
            onPointerUp={(e) => endRiskDrag("stop_loss", e)}
          >
            SL
          </button>
        </div>

        <button type="button" className={styles.closeButton} onClick={onClose}>
          x
        </button>
      </div>

      {activeField && activeY != null && !isNaN(activeY) && (
        <div
          className={cx(styles.submitBar, styles[`${orderTone}Order`])}
          style={yStyle(activeY)}
        >
          <span className={cx(styles.submitValue, activeField === "take_profit" ? styles.take : styles.stop)}>
            {activeField === "take_profit" ? "TP" : "SL"} {formatPrice(activeValue)}
          </span>

          {error && <span className={styles.error}>{error}</span>}

          <button type="button" disabled={saving} className={styles.cancelButton} onClick={cancelDraft}>
            Cancel
          </button>
          <button type="button" disabled={saving} className={cx(styles.acceptButton, saving && styles.saving)} onClick={acceptDraft}>
            {saving ? "Saving" : dirty ? "Accept" : "Done"}
          </button>
        </div>
      )}
    </>
  );
}
