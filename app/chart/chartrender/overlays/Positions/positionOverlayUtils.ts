import { useLayoutEffect, useRef, type MutableRefObject } from "react";
import { Draft, EditableLine, PositionPatch, PositionSeriesRef, PositionWithExtras } from "./positionOverlayTypes";

export function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function formatPrice(price: number | null | undefined) {
  if (price == null || !Number.isFinite(price)) return "-";
  if (Math.abs(price) >= 1) return price.toFixed(2);
  return price.toFixed(5);
}

export function normalisePrice(price: number) {
  if (!Number.isFinite(price)) return price;
  if (Math.abs(price) >= 1) return Number(price.toFixed(2));
  return Number(price.toFixed(5));
}

export function priceAtPointer(
  clientY: number,
  overlayRef: MutableRefObject<HTMLDivElement | null>,
  seriesRef: PositionSeriesRef
) {
  const rect = overlayRef.current?.getBoundingClientRect();
  if (!rect) return null;
  const price = seriesRef.current?.coordinateToPrice(clientY - rect.top);
  return price == null || !Number.isFinite(price) ? null : normalisePrice(price);
}

export function usePriceY(
  price: number | null,
  seriesRef: PositionSeriesRef,
  renderVersion?: number
) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const y = price == null ? null : seriesRef.current?.priceToCoordinate(price);
    if (!element) return;
    element.style.display = y == null || !Number.isFinite(y) ? "none" : "";
    if (y != null && Number.isFinite(y)) element.style.setProperty("--po-y", `${y}px`);
  }, [price, renderVersion, seriesRef]);
  return ref;
}

export function getDefaultLinePrice(
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

export function draftFromPosition(position: PositionWithExtras): Draft {
  return {
    stop_loss: numberOrNull(position.stop_loss),
    take_profit: numberOrNull(position.take_profit),
  };
}

export function pricesMatch(a: number | null, b: number | null) {
  if (a == null || b == null) return a == b;
  return normalisePrice(a) === normalisePrice(b);
}

export function draftMatches(a: Draft, b: Draft) {
  return (
    pricesMatch(a.stop_loss, b.stop_loss) &&
    pricesMatch(a.take_profit, b.take_profit)
  );
}

export function buildPatch(previous: Draft, next: Draft): PositionPatch {
  const patch: PositionPatch = {};

  if (!pricesMatch(previous.stop_loss, next.stop_loss)) patch.stop_loss = next.stop_loss;
  if (!pricesMatch(previous.take_profit, next.take_profit)) patch.take_profit = next.take_profit;

  return patch;
}
