import type { RawData } from "./charts";

export interface BacktestPosition {
  id: string;
  trade_id: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entry_price: number;
  entry_candle: number;
  entry_time: number;
  exit_price: number | null;
  exit_candle: number | null;
  exit_time: number | null;
  realised_pnl: number | null;
  status: "open" | "closed";
  opened_at: string;
}

export interface BacktestSession {
  session_id: string;
  ticker: string;
  interval: string;
  date_from: string;
  date_to: string;
  starting_balance: number;
  candle_count: number;
  current_candle: number;
  positions: BacktestPosition[];
  created_at: string;
  updated_at?: string;
  expires_at: string;
}

export interface BacktestResponse extends BacktestSession {
  candles: RawData[];
}

export interface BacktestSummary {
  session_id: string;
  ticker: string;
  interval: string;
  date_from: string;
  date_to: string;
  starting_balance: number;
  current_candle: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}
