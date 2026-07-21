import { tokens } from "@/app/(pages)/dashboard/components/dashboard";
import { AccountStats } from "@/app/components/types/accounts";
import { Trade } from "@/app/components/types/trades";

export const STATS = (stats: AccountStats | null, openPositions: Trade[]) => [
  {
    label: "Net P&L",
    value: stats
      ? `${stats.net_pnl >= 0 ? "+" : "-"}$${Math.abs(stats.net_pnl).toFixed(2)}`
      : "—",
    sub:   stats ? `${stats.trade_count} trades` : "",
    color: stats ? (stats.net_pnl >= 0 ? tokens.green : tokens.red) : undefined,
  },
  {
    label: "Win rate",
    value: stats ? `${stats.win_rate}%` : "—",
    sub:   stats ? `${stats.wins} of ${stats.trade_count} trades` : "",
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
    value: stats ? `-$${Math.abs(stats.worst_trade).toFixed(2)}` : "—",
    sub:   "",
    color: tokens.red,
  },
];