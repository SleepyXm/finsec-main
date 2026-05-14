import { tokens } from "@/app/dashboard/components/dashboard";
import { Portfolio } from "@/app/types/portfolio";
import { Trade } from "@/app/types/trades";

export const STATS = (portfolio: Portfolio | null, openPositions: Trade[]) => [
  {
    label: "Net P&L",
    value: portfolio
      ? `${portfolio.stats.total_realised_pnl >= 0 ? "+" : "-"}$${Math.abs(portfolio.stats.total_realised_pnl).toFixed(2)}`
      : "—",
    sub:   portfolio ? `${portfolio.stats.trade_count} trades` : "",
    color: portfolio
      ? portfolio.stats.total_realised_pnl >= 0 ? tokens.green : tokens.red
      : undefined,
  },
  {
    label: "Win rate",
    value: portfolio ? `${portfolio.stats.win_rate}%` : "—",
    sub:   portfolio ? `${portfolio.stats.wins} of ${portfolio.stats.trade_count} trades` : "",
    color: undefined,
  },
  {
    label: "Avg R:R",
    value: "1.8",
    sub:   "Above 1.5 target",
    color: tokens.green,
  },
  {
    label: "Largest loss",
    value: portfolio ? `-$${Math.abs(portfolio.stats.worst_trade).toFixed(2)}` : "—",
    sub:   "",
    color: tokens.red,
  },
];