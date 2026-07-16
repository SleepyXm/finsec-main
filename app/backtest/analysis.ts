import type { BacktestPosition } from "@/app/types/backend";
import type { RawData } from "@/app/types/charts";

export interface BacktestAnalysis {
  balance: number;
  equity: number;
  realisedPnl: number;
  unrealisedPnl: number;
  netPnl: number;
  returnPercent: number;
  totalTrades: number;
  winRate: number;
  bestTrade: number | null;
  worstTrade: number | null;
  maxDrawdown: number;
  equityCurve: Array<{ time: number; value: number }>;
}

function pnlAtPrice(position: BacktestPosition, price: number) {
  const direction = position.side === "long" ? 1 : -1;
  return (price - position.entry_price) * direction * position.quantity;
}

function closedPnl(position: BacktestPosition) {
  if (position.realised_pnl != null) return position.realised_pnl;
  return position.exit_price == null ? 0 : pnlAtPrice(position, position.exit_price);
}

export function deriveBacktestAnalysis(
  startingBalance: number,
  candles: RawData[],
  cursor: number,
  positions: BacktestPosition[],
): BacktestAnalysis {
  const closed = positions.filter((position) => position.exit_candle != null);
  const open = positions.filter((position) => position.exit_candle == null);
  const realisedPnl = closed.reduce((sum, position) => sum + closedPnl(position), 0);
  const currentPrice = candles[Math.max(0, cursor - 1)]?.close;
  const unrealisedPnl = currentPrice == null
    ? 0
    : open.reduce((sum, position) => sum + pnlAtPrice(position, currentPrice), 0);
  const netPnl = realisedPnl + unrealisedPnl;

  const equityCurve = candles.slice(0, cursor).map((candle, candleIndex) => {
    const realised = positions.reduce((sum, position) => {
      return position.exit_candle != null && position.exit_candle <= candleIndex
        ? sum + closedPnl(position)
        : sum;
    }, 0);
    const unrealised = positions.reduce((sum, position) => {
      const active = position.entry_candle <= candleIndex &&
        (position.exit_candle == null || candleIndex < position.exit_candle);
      return active ? sum + pnlAtPrice(position, candle.close) : sum;
    }, 0);
    return { time: candle.time, value: startingBalance + realised + unrealised };
  });

  let peak = startingBalance;
  let maxDrawdown = 0;
  equityCurve.forEach(({ value }) => {
    peak = Math.max(peak, value);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - value) / peak) * 100);
  });

  const results = closed.map(closedPnl);
  const wins = results.filter((pnl) => pnl > 0).length;
  return {
    balance: startingBalance + realisedPnl,
    equity: startingBalance + netPnl,
    realisedPnl,
    unrealisedPnl,
    netPnl,
    returnPercent: startingBalance ? (netPnl / startingBalance) * 100 : 0,
    totalTrades: closed.length,
    winRate: closed.length ? (wins / closed.length) * 100 : 0,
    bestTrade: results.length ? Math.max(...results) : null,
    worstTrade: results.length ? Math.min(...results) : null,
    maxDrawdown,
    equityCurve,
  };
}
