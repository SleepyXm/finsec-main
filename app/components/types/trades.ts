export const MAX_TRADE_QUANTITY = 1_000_000;

export type OrderType = "market" | "limit";
export type OrderIntent = {
  orderType: OrderType;
  limitPrice?: number;
};

export type Trade = {
  id?: string;
  trade_id: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  price?: number | null;
  entry_price: number;
  order_type?: OrderType;
  stop_loss?: number | null;
  take_profit?: number | null;
  status: "pending" | "open" | "closed" | "cancelled";
  opened_at: string;
};

export type TradePatch = Partial<
  Pick<Trade, "order_type" | "price" | "stop_loss" | "take_profit">
>;

export interface OpenPositionsProps {
  positions: Trade[];
  livePnLMap: Record<string, number>;
  onClose: (tradeId: string) => void;
  accountUnrealisedPnL?: number;
}

export type TradeSuccessConfirm = {
  trade_id: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  price: number;
  entry_price: number | null;
  order_type: OrderType;
  status: "pending" | "open";
  queued_at?: string;
  flushed_at: string;
};

export type TradeErrorConfirm = {
  status: "error";
  error?: string;
  queued_at?: string;
  flushed_at?: string;
};

export type TradeConfirm = TradeSuccessConfirm | TradeErrorConfirm;
