import type { PerformanceStats } from "./accounts";
import type { Trade } from "./trades";

export interface TradeHistory extends Pick<
  Trade,
  "trade_id" | "symbol" | "side" | "quantity" | "entry_price"
> {
  id: string;
  exit_price: number | null;
  realised_pnl: number | null;
  opened_at: string;
  closed_at: string | null;
}

export interface TradeHistoryRow {
  id: string;
  trade_id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: string;   // formatted: "$847.20"
  exit_price: string;    // formatted: "$172.40" | "—"
  realised_pnl: string;  // formatted: "+$12.50" | "—"
  rr: string;
  date: string;
  note: string;
}


export interface PortfolioStats extends PerformanceStats {
  total_realised_pnl: number;
}

export interface PortfolioPage {
  history: TradeHistory[];
  next_cursor: TradeCursor | null;
  stats: PortfolioStats;
}

export interface TradeCursor {
  cursor_time: string; // RFC3339
  cursor_id: string;
}
