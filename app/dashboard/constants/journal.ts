import { Portfolio } from "@/app/types/portfolio";

export interface JournalEntry {
  side: "L" | "S";
  symbol: string;
  time: string;
  note: string;
  pnl: string;
  pct: string;
  up: boolean;
}

export const JOURNAL = (portfolio: Portfolio | null) => {
  const trades = (portfolio?.history ?? []).filter((t) => t.closed_at).slice(0, 18);

  const dailyPnl: Record<string, number> = {};
  for (const t of trades) {
    const date = new Date(t.closed_at!).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    dailyPnl[date] = (dailyPnl[date] ?? 0) + (t.realised_pnl ?? 0);
  }

  return trades.map((t) => {
    const pnl = t.realised_pnl ?? 0;
    const up  = pnl >= 0;
    const date = new Date(t.closed_at!);
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    return {
      id:       t.id,
      side:     t.side.charAt(0).toUpperCase(),
      symbol:   decodeURIComponent(t.symbol),
      date:     new Date(t.closed_at!).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
      day:      date.getDate(),
      monthKey,
      time:     new Date(t.closed_at!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      pnl:      `${up ? "+" : "-"}$${Math.abs(pnl).toFixed(2)}`,
      pct:      `${up ? "+" : "-"}${((Math.abs(pnl) / t.entry_price) * 100).toFixed(1)}%`,
      note:     "—",
      up,
      full_pnl: dailyPnl[date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })],
    };
  });
};

export const groupByDate = (entries: ReturnType<typeof JOURNAL>) => {
  const groups: Record<string, typeof entries> = {};
  entries.forEach((j) => {
    const date = j.time.split(",")[0];
    if (!groups[date]) groups[date] = [];
    groups[date].push(j);
  });
  return groups;
};