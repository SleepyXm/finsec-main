import { TradeHistory } from "@/app/types/portfolio";

// Helper to group journal entries by date
const groupByDate = (entries: ReturnType<typeof any>) => {
  const groups: Record<string, typeof entries> = {};
  entries.forEach((j) => {
    // Re-parse the date from closed_at for grouping key
    const date = j.time.split(",")[0]; // e.g. "Mon"
    if (!groups[date]) groups[date] = [];
    groups[date].push(j);
  });
  return groups;
};

export function toPnLCurve(history: TradeHistory[]) {
  const closed = history
    .filter(t => t.realised_pnl !== null && t.closed_at !== null)
    .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());

  // Group by YYYY-MM-DD and sum pnl per day
  const dailyMap = new Map<string, number>();
  for (const t of closed) {
    const day = t.closed_at!.slice(0, 10); // "YYYY-MM-DD"
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + t.realised_pnl!);
  }

  // Build cumulative curve
  let cumulative = 0;
  const points = Array.from(dailyMap.entries()).map(([day, pnl]) => {
    cumulative += pnl;
    return { time: day, value: cumulative };
  });

  if (points.length === 0) return [];

  const firstDate = new Date(points[0].time);
  firstDate.setDate(firstDate.getDate() - 1);
  const anchor = { time: firstDate.toISOString().slice(0, 10), value: 0 };

  return [anchor, ...points];
};
