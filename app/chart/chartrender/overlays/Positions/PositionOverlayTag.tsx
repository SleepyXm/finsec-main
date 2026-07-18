"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent } from "react";
import { cx } from "@/app/ui";
import { DraggablePriceLine, EntryPriceLine } from "./PositionOverlayLine";
import styles from "./PositionOverlay.module.css";
import { Draft, EditableLine, PositionPatch, PositionSeriesRef, PositionWithExtras } from "./positionOverlayTypes";
import { buildPatch, draftFromPosition, draftMatches, formatPrice, getDefaultLinePrice, priceAtPointer, usePriceY } from "./positionOverlayUtils";

const RISK_LINES = {
  stop_loss: { label: "SL", tone: "stop" },
  take_profit: { label: "TP", tone: "take" },
} as const;
const RISK_BUTTONS: EditableLine[] = ["take_profit", "stop_loss"];

export function PositionTag({
  position,
  livePnL,
  isLong,
  seriesRef,
  overlayRef,
  renderVersion,
  onClose,
  onUpdate,
}: {
  position: PositionWithExtras;
  livePnL: number;
  isLong: boolean;
  seriesRef: PositionSeriesRef;
  overlayRef: MutableRefObject<HTMLDivElement | null>;
  renderVersion?: number;
  onClose?: () => void;
  onUpdate?: (patch: PositionPatch) => void | Promise<void>;
}) {
  const dragStartRef = useRef<{ field: EditableLine; y: number; moved: boolean } | null>(null);
  const persisted = useMemo(
    () => draftFromPosition(position),
    [position]
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
    [position, isLong]
  );

  const stopLossValue = draft.stop_loss ?? defaultLines.stop_loss;
  const takeProfitValue = draft.take_profit ?? defaultLines.take_profit;
  const activeValue =
    activeField === "stop_loss"
      ? stopLossValue
      : activeField === "take_profit"
        ? takeProfitValue
        : null;
  const orderTone = isLong ? "long" : "short";
  const tagRef = usePriceY(position.entry_price, seriesRef, renderVersion);
  const submitRef = usePriceY(activeValue, seriesRef, renderVersion);

  function updateDraftLine(field: EditableLine, value: number | null) {
    setDraft((current) => ({ ...current, [field]: value }));
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

    const price = priceAtPointer(e.clientY, overlayRef, seriesRef);
    if (price != null) updateDraftLine(field, price);
  }

  function endRiskDrag(field: EditableLine, e: PointerEvent<HTMLButtonElement>) {
    const drag = dragStartRef.current;
    if (!drag || drag.field !== field) return;

    if (drag.moved) {
      const price = priceAtPointer(e.clientY, overlayRef, seriesRef);
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
      <EntryPriceLine
        price={position.entry_price}
        orderTone={orderTone}
        seriesRef={seriesRef}
        renderVersion={renderVersion}
      />

      {activeField && (() => {
        const config = RISK_LINES[activeField];
        const value = activeField === "stop_loss" ? stopLossValue : takeProfitValue;
        return <DraggablePriceLine
          field={activeField}
          label={config.label}
          value={value}
          isPreview={draft[activeField] == null}
          tone={config.tone}
          seriesRef={seriesRef}
          overlayRef={overlayRef}
          renderVersion={renderVersion}
          onPreview={updateDraftLine}
          onCommit={updateDraftLine}
          onClear={(field) => updateDraftLine(field, null)}
        />;
      })()}

      <div
        ref={tagRef}
        className={cx(
          styles.tag,
          styles[`${orderTone}Order`],
          activeField && styles.tagEditing
        )}
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
          {RISK_BUTTONS.map((field) => {
            const config = RISK_LINES[field];
            return <button
              key={field}
              type="button"
              className={cx(styles.riskButton, styles[config.tone], activeField === field && styles.riskButtonActive)}
              onClick={() => setActiveField(field)}
              onPointerDown={(event) => startRiskDrag(field, event)}
              onPointerMove={(event) => moveRiskDrag(field, event)}
              onPointerUp={(event) => endRiskDrag(field, event)}
            >
              {config.label}
            </button>;
          })}
        </div>

        <button type="button" className={styles.closeButton} onClick={onClose}>
          x
        </button>
      </div>

      {activeField && (
        <div
          ref={submitRef}
          className={cx(styles.submitBar, styles[`${orderTone}Order`])}
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
