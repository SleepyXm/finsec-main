import type { MutableRefObject } from "react";

export type OrderType = "market" | "limit";

export type PositionWithExtras = {
  trade_id: string;
  id?: string;
  symbol: string;
  side: "long" | "short";
  quantity?: number;
  price?: number | null;
  entry_price: number;
  order_type?: OrderType;
  stop_loss?: number | null;
  take_profit?: number | null;
  [key: string]: any;
};

export type PositionPatch = Partial<
  Pick<PositionWithExtras, "order_type" | "price" | "stop_loss" | "take_profit">
>;

export type EditableLine = "stop_loss" | "take_profit";

export type Draft = {
  order_type: OrderType;
  price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
};

export type PositionTagsProps = {
  positions: PositionWithExtras[];
  livePnLMap: Record<string, number>;
  seriesRef: MutableRefObject<any>;
  renderVersion?: number;
  onClosePosition?: (id: string) => void;
  updatePosition?: (id: string, patch: PositionPatch) => void | Promise<void>;
};
