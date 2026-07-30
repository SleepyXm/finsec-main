"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import { cx } from "@/app/UI";
import { DraggablePriceLine, EntryPriceLine } from "./PositionOverlayLine";
import styles from "./PositionOverlay.module.css";
import {
  type Draft,
  type EditableLine,
  type PositionPatch,
  type PositionSeriesRef,
  type PositionWithExtras,
} from "./positionOverlayTypes";
import {
  buildPatch,
  draftFromPosition,
  draftMatches,
  formatPrice,
  getDefaultLinePrice,
  priceAtPointer,
  usePriceY,
} from "./positionOverlayUtils";

const RISK_LINES = {
  take_profit: { label: "TP", tone: "take" },
  stop_loss: { label: "SL", tone: "stop" },
} as const;
const RISK_FIELDS: EditableLine[] = ["take_profit", "stop_loss"];

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
  const dragStartRef = useRef<{
    field: EditableLine;
    y: number;
    moved: boolean;
  } | null>(null);
  const persisted = useMemo(() => draftFromPosition(position), [position]);
  const [activeField, setActiveField] = useState<EditableLine | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(persisted);

  useEffect(() => {
    setDraft(persisted);
    setError(null);
  }, [persisted]);

  const dirty = !draftMatches(persisted, draft);
  const defaultLines = useMemo(() => ({
    stop_loss: getDefaultLinePrice(position, "stop_loss", isLong),
    take_profit: getDefaultLinePrice(position, "take_profit", isLong),
  }), [position, isLong]);
  const values: Record<EditableLine, number> = {
    stop_loss: draft.stop_loss ?? defaultLines.stop_loss,
    take_profit: draft.take_profit ?? defaultLines.take_profit,
  };
  const orderTone = isLong ? "long" : "short";
  const pending = position.status === "pending";
  const tagRef = usePriceY(position.entry_price, seriesRef, renderVersion);
  const submitRef = usePriceY(position.entry_price, seriesRef, renderVersion);

  function updateDraftLine(field: EditableLine, value: number | null) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function projectedPnl(value: number) {
    const direction = isLong ? 1 : -1;
    return (value - position.entry_price) * direction * position.quantity;
  }

  function startRiskDrag(field: EditableLine, event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setActiveField(field);
    setError(null);
    dragStartRef.current = { field, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveRiskDrag(field: EditableLine, event: PointerEvent<HTMLButtonElement>) {
    const drag = dragStartRef.current;
    if (!drag || drag.field !== field) return;
    if (!drag.moved && Math.abs(event.clientY - drag.y) < 3) return;
    drag.moved = true;

    const price = priceAtPointer(event.clientY, overlayRef, seriesRef);
    if (price != null) updateDraftLine(field, price);
  }

  function endRiskDrag(field: EditableLine, event: PointerEvent<HTMLButtonElement>) {
    const drag = dragStartRef.current;
    if (!drag || drag.field !== field) return;
    if (drag.moved) {
      const price = priceAtPointer(event.clientY, overlayRef, seriesRef);
      if (price != null) updateDraftLine(field, price);
    }
    dragStartRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  }

  async function confirmDraft() {
    const takeProfitInvalid = isLong
      ? values.take_profit <= position.entry_price
      : values.take_profit >= position.entry_price;
    const stopLossInvalid = isLong
      ? values.stop_loss >= position.entry_price
      : values.stop_loss <= position.entry_price;
    if (takeProfitInvalid || stopLossInvalid) {
      setError(isLong
        ? "Buy positions require TP above entry and SL below entry"
        : "Sell positions require TP below entry and SL above entry");
      return;
    }
    if (!dirty) {
      setActiveField(null);
      return;
    }
    setSaving(true);
    setError(null);

    try {
      await onUpdate?.(buildPatch(persisted, draft));
      setActiveField(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update trade");
    } finally {
      setSaving(false);
    }
  }

  function discardDraft() {
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

      {activeField && RISK_FIELDS.map((field) => {
        const config = RISK_LINES[field];
        return (
          <DraggablePriceLine
            key={field}
            field={field}
            label={config.label}
            value={values[field]}
            projectedPnl={projectedPnl(values[field])}
            isPreview={draft[field] == null}
            tone={config.tone}
            seriesRef={seriesRef}
            overlayRef={overlayRef}
            renderVersion={renderVersion}
            onPreview={(nextField, value) => {
              setActiveField(nextField);
              updateDraftLine(nextField, value);
            }}
            onCommit={updateDraftLine}
            onClear={(nextField) => updateDraftLine(nextField, null)}
          />
        );
      })}

      <div
        ref={tagRef}
        className={cx(
          styles.tag,
          styles[`${orderTone}Order`],
          activeField && styles.tagEditing,
          pending && styles.pendingOrder,
        )}
      >
        <div className={styles.corner} />
        <div className={styles.tagMeta}>
          <span className={styles.tagTitle}>
            <span className={styles.side}>
              {position.quantity} {isLong ? "Buy" : "Sell"}
              {position.order_type === "limit" ? " limit" : ""}
            </span>
            {" · "}{position.symbol}
          </span>
          {pending ? (
            <span className={styles.pendingText}>
              Pending at {formatPrice(position.entry_price)}
            </span>
          ) : (
            <span className={cx(
              styles.pnl,
              livePnL >= 0 ? styles.positive : styles.negative,
            )}>
              {livePnL >= 0 ? "+" : "−"}${Math.abs(livePnL).toFixed(2)}
            </span>
          )}
        </div>

        <div className={styles.riskControls}>
          {RISK_FIELDS.map((field) => {
            const config = RISK_LINES[field];
            return (
              <button
                key={field}
                type="button"
                className={cx(
                  styles.riskButton,
                  styles[config.tone],
                  activeField === field && styles.riskButtonActive,
                )}
                onClick={() => setActiveField(field)}
                onPointerDown={(event) => startRiskDrag(field, event)}
                onPointerMove={(event) => moveRiskDrag(field, event)}
                onPointerUp={(event) => endRiskDrag(field, event)}
              >
                {config.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          title={pending ? "Cancel limit order" : "Close position"}
          aria-label={pending ? "Cancel limit order" : "Close position"}
        >
          ×
        </button>
      </div>

      {activeField && (
        <div
          ref={submitRef}
          className={cx(styles.submitBar, styles[`${orderTone}Order`])}
        >
          <button
            type="button"
            disabled={saving}
            className={styles.cancelButton}
            onClick={discardDraft}
          >
            Discard
          </button>
          <button
            type="button"
            disabled={saving}
            className={cx(styles.acceptButton, saving && styles.saving)}
            onClick={confirmDraft}
          >
            {saving ? "Saving" : "Confirm"}
          </button>
          <span className={cx(styles.submitValue, styles.take)}>
            TP {formatPrice(values.take_profit)}
          </span>
          <span className={cx(styles.submitValue, styles.stop)}>
            SL {formatPrice(values.stop_loss)}
          </span>
          {error && <span className={styles.error}>{error}</span>}
        </div>
      )}
    </>
  );
}
