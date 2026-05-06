export interface BacktestCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface BacktestSession {
  session_id: string;
  ticker: string;
  interval: string;
  date_from: string;
  date_to: string;
  starting_balance: number;
  candle_count: number;
  created_at: string;
}

export interface BacktestResponse {
  session_id: string;
  ticker: string;
  interval: string;
  candle_count: number;
  starting_balance: number;
  candles: BacktestCandle[];
}