export interface AccountStats {
  balance:           number;
  net_pnl:           number;
  trade_count:       number;
  wins:              number;
  losses:            number;
  win_rate:          number;
  avg_pnl_per_trade: number;
  best_trade:        number;
  worst_trade:       number;
}

export interface JournalTrade {
  id:       string;
  trade_id: string;
  symbol:   string;
  side:     string;
  pnl:      number;
}

export interface JournalDay {
  pnl:         number;
  trade_count: number;
  trades:      JournalTrade[];
}

// keyed by "YYYY-MM-DD"
export interface JournalResponse {
  month: string;
  days:  Record<string, JournalDay>;
}

export interface PnLPoint {
  date:        string;   // "YYYY-MM-DD"
  daily_pnl:   number;
  cumulative:  number;
}

export interface PnLCurveResponse {
  points: PnLPoint[];
}

export type PnLPeriod = "week" | "month" | "all";
