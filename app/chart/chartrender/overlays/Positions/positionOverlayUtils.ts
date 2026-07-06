import type { Draft, EditableLine, PositionPatch, PositionWithExtras } from "./positionOverlayTypes";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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
    order_type: position.order_type === "limit" ? "limit" : "market",
    price: numberOrNull(position.price) ?? numberOrNull(position.entry_price),
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
    a.order_type === b.order_type &&
    pricesMatch(a.price, b.price) &&
    pricesMatch(a.stop_loss, b.stop_loss) &&
    pricesMatch(a.take_profit, b.take_profit)
  );
}

export function buildPatch(previous: Draft, next: Draft): PositionPatch {
  const patch: PositionPatch = {};

  if (previous.order_type !== next.order_type) patch.order_type = next.order_type;
  if (!pricesMatch(previous.price, next.price)) patch.price = next.price;
  if (!pricesMatch(previous.stop_loss, next.stop_loss)) patch.stop_loss = next.stop_loss;
  if (!pricesMatch(previous.take_profit, next.take_profit)) patch.take_profit = next.take_profit;

  return patch;
}
