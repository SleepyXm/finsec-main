import type { MutableRefObject } from "react";
import type { Trade, TradePatch } from "@/app/components/types/trades";

export type EditableLine = "stop_loss" | "take_profit";
export type PositionWithExtras = Pick<
  Trade,
  "trade_id" | "symbol" | "side" | "entry_price" | EditableLine
>;
export type PositionPatch = Pick<TradePatch, EditableLine>;
export type Draft = Record<EditableLine, number | null>;

export type PositionSeriesRef = MutableRefObject<{
  coordinateToPrice: (coordinate: number) => number | null;
  priceToCoordinate: (price: number) => number | null;
} | null>;

export type PositionTagsProps = {
  positions: PositionWithExtras[];
  livePnLMap: Record<string, number>;
  seriesRef: PositionSeriesRef;
  renderVersion?: number;
  onClosePosition?: (id: string) => void;
  updatePosition?: (id: string, patch: PositionPatch) => void | Promise<void>;
};
