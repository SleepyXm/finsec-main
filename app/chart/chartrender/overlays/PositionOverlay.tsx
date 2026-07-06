"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent } from "react";
import { ACCENT, DANGER, SUCCESS, theme, cornerStyle } from "@/app/components/UI/UI";

// --- types ------------------------------------------------------------------

type PositionWithExtras = {
  position_id?: string;
  id?: string;
  symbol: string;
  side: "long" | "short";
  entry_price: number;
  stop_loss?: number | null;
  take_profit?: number | null;
  [key: string]: any;
};

interface PositionTagsProps {
  positions: PositionWithExtras[];
  livePnLMap: Record<string, number>;
  seriesRef: MutableRefObject<any>;
  onClosePosition?: (id: string) => void;
  updatePosition?: (id: string, patch: Partial<PositionWithExtras>) => void;
}

type EditableLine = "stop_loss" | "take_profit";

// --- helpers ----------------------------------------------------------------

function formatPrice(price: number) {
  if (!Number.isFinite(price)) return "—";
  if (Math.abs(price) >= 1) return price.toFixed(2);
  return price.toFixed(5);
}

function normalisePrice(price: number) {
  if (!Number.isFinite(price)) return price;
  if (Math.abs(price) >= 1) return Number(price.toFixed(2));
  return Number(price.toFixed(5));
}

function getDefaultLinePrice(
  position: PositionWithExtras,
  field: EditableLine,
  isLong: boolean
) {
  const offset = Math.max(Math.abs(position.entry_price) * 0.01, 0.01);

  if (field === "stop_loss") {
    return isLong ? position.entry_price - offset : position.entry_price + offset;
  }

  return isLong ? position.entry_price + offset : position.entry_price - offset;
}

// --- draggable price line ----------------------------------------------------

function DraggablePriceLine({
  field,
  label,
  value,
  isPreview,
  color,
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
  color: string;
  seriesRef: MutableRefObject<any>;
  overlayRef: MutableRefObject<HTMLDivElement | null>;
  onPreview: (field: EditableLine, value: number) => void;
  onCommit: (field: EditableLine, value: number) => void;
  onClear: (field: EditableLine) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const t = theme.dark;

  const y = seriesRef.current?.priceToCoordinate(value);

  if (y == null || isNaN(y)) return null;

  function priceFromPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const coordinate = e.clientY - rect.top;
    const price = seriesRef.current?.coordinateToPrice(coordinate);

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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "absolute",
        left: 0,
        right: 90,
        top: y - 9,
        height: 18,
        cursor: "ns-resize",
        pointerEvents: "auto",
        zIndex: dragging ? 40 : 25,
        opacity: isPreview ? 0.65 : 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 9,
          borderTop: `1px dashed ${color}`,
          boxShadow: dragging ? `0 0 10px ${color}` : "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          right: 0,
          top: -2,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: t.surface,
          border: `1px solid ${color}`,
          color,
          padding: "2px 6px",
          fontFamily: "var(--font-display), monospace",
          fontSize: 9,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          userSelect: "none",
        }}
      >
        <span>
          {label}
          {isPreview ? " preview" : ""} · {formatPrice(value)}
        </span>

        {!isPreview && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClear(field);
            }}
            style={{
              background: "none",
              border: "none",
              color,
              cursor: "pointer",
              fontSize: 10,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// --- entry line --------------------------------------------------------------

function EntryPriceLine({
  y,
  color,
}: {
  y: number;
  color: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 90,
        top: y,
        borderTop: `1px solid ${color}`,
        opacity: 0.35,
        pointerEvents: "none",
        zIndex: 8,
      }}
    />
  );
}

// --- individual tag ----------------------------------------------------------

function PositionTag({
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
  onUpdate?: (patch: Partial<PositionWithExtras>) => void;
}) {
  const [editing, setEditing] = useState(false);

  const [draft, setDraft] = useState<{
    stop_loss: number | null;
    take_profit: number | null;
  }>({
    stop_loss: position.stop_loss ?? null,
    take_profit: position.take_profit ?? null,
  });

  useEffect(() => {
    setDraft({
      stop_loss: position.stop_loss ?? null,
      take_profit: position.take_profit ?? null,
    });
  }, [position.position_id, position.id, position.stop_loss, position.take_profit]);

  const t = theme.dark;
  const sideColor = isLong ? SUCCESS : DANGER;
  const sideBg = isLong ? "rgba(141,191,163,0.06)" : "rgba(199,125,125,0.06)";
  const pnlColor = livePnL >= 0 ? SUCCESS : DANGER;

  const defaultLines = useMemo(
    () => ({
      stop_loss: getDefaultLinePrice(position, "stop_loss", isLong),
      take_profit: getDefaultLinePrice(position, "take_profit", isLong),
    }),
    [position.entry_price, isLong]
  );

  function handlePreview(field: EditableLine, value: number) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleCommit(field: EditableLine, value: number) {
    const nextValue = normalisePrice(value);

    setDraft((current) => ({
      ...current,
      [field]: nextValue,
    }));

    onUpdate?.({
      [field]: nextValue,
    });
  }

  function handleClear(field: EditableLine) {
    setDraft((current) => ({
      ...current,
      [field]: null,
    }));

    onUpdate?.({
      [field]: null,
    });
  }

  const stopLossValue = draft.stop_loss ?? defaultLines.stop_loss;
  const takeProfitValue = draft.take_profit ?? defaultLines.take_profit;

  return (
    <>
      <EntryPriceLine y={y} color={sideColor} />

      {editing && (
        <>
          <DraggablePriceLine
            field="stop_loss"
            label="SL"
            value={stopLossValue}
            isPreview={draft.stop_loss == null}
            color={DANGER}
            seriesRef={seriesRef}
            overlayRef={overlayRef}
            onPreview={handlePreview}
            onCommit={handleCommit}
            onClear={handleClear}
          />

          <DraggablePriceLine
            field="take_profit"
            label="TP"
            value={takeProfitValue}
            isPreview={draft.take_profit == null}
            color={SUCCESS}
            seriesRef={seriesRef}
            overlayRef={overlayRef}
            onPreview={handlePreview}
            onCommit={handleCommit}
            onClear={handleClear}
          />
        </>
      )}

      <div
        style={{
          position: "absolute",
          right: 90,
          top: y - 16,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          background: sideBg,
          border: `1px solid ${editing ? ACCENT : t.borderSoft}`,
          borderLeft: `2px solid ${sideColor}`,
          padding: "3px 6px",
          gap: 8,
          minWidth: 140,
          zIndex: 30,
        }}
      >
        <div style={cornerStyle()} />

        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span
            style={{
              fontFamily: "var(--font-display), monospace",
              fontSize: 10,
              color: sideColor,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            {position.side} · {position.symbol}
          </span>

          <span
            style={{
              fontFamily: "var(--font-display), monospace",
              fontSize: 10,
              color: pnlColor,
            }}
          >
            {livePnL >= 0 ? "+" : ""}${livePnL.toFixed(2)}
          </span>
        </div>

        <button
          onClick={() => setEditing((current) => !current)}
          style={{
            background: "none",
            border: "none",
            color: editing ? ACCENT : t.muted2,
            cursor: "pointer",
            fontFamily: "var(--font-display)",
            fontSize: 9,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            padding: "0 2px",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
          onMouseLeave={(e) => (e.currentTarget.style.color = editing ? ACCENT : t.muted2)}
        >
          {editing ? "done" : "edit"}
        </button>

        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: t.muted2,
            cursor: "pointer",
            fontSize: 11,
            padding: "0 2px",
            lineHeight: 1,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = DANGER)}
          onMouseLeave={(e) => (e.currentTarget.style.color = t.muted2)}
        >
          ✕
        </button>
      </div>
    </>
  );
}

// --- wrapper ----------------------------------------------------------------

export function PositionTags({
  positions,
  livePnLMap,
  seriesRef,
  onClosePosition,
  updatePosition,
}: PositionTagsProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const tags = positions.map((position) => {
    const id = position.position_id ?? position.id ?? "";
    const livePnL = livePnLMap[id] ?? 0;
    const isLong = position.side === "long";
    const y = seriesRef.current?.priceToCoordinate(position.entry_price);

    return { id, position, livePnL, isLong, y };
  });

  return (
    <div
      ref={overlayRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {tags.map(({ id, position, livePnL, isLong, y }) => {
        if (y == null || isNaN(y)) return null;

        return (
          <PositionTag
            key={id}
            position={position}
            livePnL={livePnL}
            isLong={isLong}
            y={y}
            seriesRef={seriesRef}
            overlayRef={overlayRef}
            onClose={() => onClosePosition?.(id)}
            onUpdate={(patch) => updatePosition?.(id, patch)}
          />
        );
      })}
    </div>
  );
}