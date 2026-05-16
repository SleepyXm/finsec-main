import { JournalResponse } from "@/app/types/accounts";

export interface CalendarTrade {
  id:     string;
  symbol: string;
  pnl:    string;  // formatted: "+$12.50"
  up:     boolean;
}

export interface CalendarCell {
  day:     number;
  hasData: boolean;
  pnl:     number;
  trades:  CalendarTrade[];
}

export interface CalendarWeek {
  days: (CalendarCell | null)[];
}

export interface Calendar {
  month:      string;   // "May"
  year:       number;
  monthIndex: number;   // 0-based
  weeks:      CalendarWeek[];
}

// Converts the server's JournalResponse into a calendar grid.
// month param: "YYYY-MM", defaults to current month if omitted.
export function buildCalendarFromJournal(
  journal: JournalResponse | null,
  month?: string,
): Calendar {
  const ref = month
    ? new Date(`${month}-01`)
    : journal?.month
    ? new Date(`${journal.month}-01`)
    : new Date();

  const year       = ref.getFullYear();
  const monthIndex = ref.getMonth();
  const monthName  = ref.toLocaleString("en-GB", { month: "long" });

  const daysInMonth  = new Date(year, monthIndex + 1, 0).getDate();
  // getDay() is 0=Sun..6=Sat; convert to Mon=0..Sun=6
  const firstDayDow  = (new Date(year, monthIndex, 1).getDay() + 6) % 7;

  const days = journal?.days ?? {};

  const cells: (CalendarCell | null)[] = [
    ...Array(firstDayDow).fill(null),   // leading padding
  ];

  for (let d = 1; d <= daysInMonth; d++) {
    const key  = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const data = days[key];

    if (data) {
      cells.push({
        day:     d,
        hasData: true,
        pnl:     data.pnl,
        trades:  data.trades.map((t) => ({
          id:     t.id,
          symbol: t.symbol,
          pnl:    `${t.pnl >= 0 ? "+" : "-"}$${Math.abs(t.pnl).toFixed(2)}`,
          up:     t.pnl >= 0,
        })),
      });
    } else {
      cells.push({ day: d, hasData: false, pnl: 0, trades: [] });
    }
  }

  // Chunk into weeks
  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const slice = cells.slice(i, i + 7);
    while (slice.length < 7) slice.push(null); // trailing padding
    weeks.push({ days: slice });
  }

  return { month: monthName, year, monthIndex, weeks };
}