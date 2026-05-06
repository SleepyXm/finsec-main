export interface TradeHistory {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  realised_pnl: number | null;
  opened_at: string;
  closed_at: string | null;
}

export interface PortfolioStats {
  total_realised_pnl: number;
  trade_count: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_pnl_per_trade: number;
  best_trade: number;
  worst_trade: number;
}

export interface Portfolio {
  history: TradeHistory[];
  stats: PortfolioStats;
}