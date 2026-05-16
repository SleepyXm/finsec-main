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


export interface CalendarDay {
  day: number;          // 1-31
  date: string;         // "Mon 5 May"
  pnl: number;          // net P&L for the day (0 if no trades)
  trades: ReturnType<typeof JOURNAL>;
  hasData: boolean;
}

export interface CalendarWeek {
  days: (CalendarDay | null)[];  // null = padding cell
}

export const buildCalendar = (
  entries: ReturnType<typeof JOURNAL>
): { month: string; weeks: CalendarWeek[]; year: number; monthIndex: number } => {
  // Derive the month from the first entry (most recent trade)
  const ref = entries[0]
    ? new Date(entries[0].monthKey.split("-")[0] + "-" + (parseInt(entries[0].monthKey.split("-")[1]) + 1) + "-01")
    : new Date();

  const year = ref.getFullYear();
  const monthIndex = ref.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDow = new Date(year, monthIndex, 1).getDay(); // 0=Sun
  // Shift so Monday = 0
  const startPad = (firstDow + 6) % 7;

  // Build a lookup: day-of-month → { pnl, trades }
  const byDay: Record<number, { pnl: number; trades: ReturnType<typeof JOURNAL> }> = {};
  for (const e of entries) {
    const d = e.day;
    if (!byDay[d]) byDay[d] = { pnl: 0, trades: [] };
    byDay[d].pnl += e.up ? parseFloat(e.pnl.replace(/[^0-9.]/g, "")) * (e.up ? 1 : -1) : -parseFloat(e.pnl.replace(/[^0-9.]/g, ""));
    byDay[d].trades.push(e);
  }
  // Re-derive pnl from full_pnl (already summed)
  for (const e of entries) {
    byDay[e.day]!.pnl = e.full_pnl;
  }

  const month = new Date(year, monthIndex).toLocaleString("en-GB", { month: "long" });

  // Flatten into 7-col grid
  const cells: (CalendarDay | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const data = byDay[d];
      return {
        day: d,
        date: new Date(year, monthIndex, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
        pnl: data?.pnl ?? 0,
        trades: data?.trades ?? [],
        hasData: !!data,
      } as CalendarDay;
    }),
  ];

  // Chunk into weeks
  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push({ days: cells.slice(i, i + 7).concat(Array(Math.max(0, 7 - cells.slice(i, i + 7).length)).fill(null)) });
  }

  return { month, weeks, year, monthIndex };
};