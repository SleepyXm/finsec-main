// app/dashboard/page.tsx  (or wherever your route lives)
// ─────────────────────────────────────────────────────────────
//  Dashboard page — layout + placeholder data only.
//  Styling lives entirely in components/ui/dashboard.tsx
// ─────────────────────────────────────────────────────────────
 
"use client";

import {
  Btn,
  Badge,
  BarRow,
  Card,
  CardFooter,
  Column,
  DataTable,
  Grid2,
  PageHeader,
  Pill,
  PillVariant,
  Row,
  Sep,
  StatCard,
  StatRow,
  tokens,
} from "@/app/dashboard/components/dashboard";
import { useState, useEffect } from 'react';
import { fetchPortfolio } from "../handlers/portfolio";
import { Portfolio } from "../types/portfolio";
import { useUser } from "../provider/userprovider";
import { PnLChart } from "../chart/chartrender";
import { toPnLCurve } from "./components/functions";

// ── Placeholder types (replace with your real models later) ──
 
interface Asset {
  init: string;
  symbol: string;
  name: string;
  price: string;
  change: string;
  up: boolean;
  bg: string;
  color: string;
}
 
interface JournalEntry {
  side: "L" | "S";
  symbol: string;
  time: string;
  note: string;
  pnl: string;
  pct: string;
  up: boolean;
}
 
interface Indicator {
  label: string;
  value: number;
  color: string;
}
 
interface Trade {
  symbol: string;
  side: string;
  entry: string;
  exit: string;
  size: number;
  pnl: string;
  rr: string;
  date: string;
  note: string;
}
 
// ── Placeholder data (swap for API / props later) ────────────
 
const STATS = (portfolio: Portfolio | null) => [
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
  { label: "Win rate",       value: portfolio ? `${portfolio.stats.win_rate}%`: "—", sub: portfolio ? `${portfolio.stats.wins} of ${portfolio.stats.trade_count} trades` : "", color: undefined    },
  { label: "Avg R:R",        value: "1.8",      sub: "Above 1.5 target",    color: tokens.green },
  { label: "Open positions", value: "2",        sub: "NVDA · SPY",          color: undefined    },
  { label: "Largest loss",   value: portfolio ? `-$${Math.abs(portfolio.stats.worst_trade).toFixed(2)}` : "—", sub: "", color: tokens.red },
];
 
const ASSETS: Asset[] = [
  { init: "NV", symbol: "NVDA", name: "Nvidia Corp",  price: "$847.20", change: "+2.14%", up: true,  bg: tokens.blueDim,              color: tokens.blue  },
  { init: "AP", symbol: "AAPL", name: "Apple Inc",    price: "$190.05", change: "+1.52%", up: true,  bg: tokens.greenDim,             color: tokens.green },
  { init: "TS", symbol: "TSLA", name: "Tesla Inc",    price: "$172.40", change: "-1.88%", up: false, bg: tokens.redDim,               color: tokens.red   },
  { init: "SP", symbol: "SPY",  name: "S&P 500 ETF",  price: "$523.11", change: "+0.43%", up: true,  bg: "rgba(251,191,36,0.10)",     color: "#fbbf24"    },
];
 


// Helper to group journal entries by date
const groupByDate = (entries: ReturnType<typeof JOURNAL>) => {
  const groups: Record<string, typeof entries> = {};
  entries.forEach((j) => {
    // Re-parse the date from closed_at for grouping key
    const date = j.time.split(",")[0]; // e.g. "Mon"
    if (!groups[date]) groups[date] = [];
    groups[date].push(j);
  });
  return groups;
};

export const JOURNAL = (portfolio: Portfolio | null) => {
  const trades = (portfolio?.history ?? []).filter((t) => t.closed_at).slice(0, 18);

  const dailyPnl: Record<string, number> = {};
  for (const t of trades) {
    const date = new Date(t.closed_at!).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
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
 
const INDICATORS: Indicator[] = [
  { label: "EMA 9", value: 92, color: tokens.accent  },
  { label: "VWAP",  value: 78, color: "#7950f2"  },
  { label: "RSI",   value: 61, color: "#1098ad"  },
  { label: "BB",    value: 44, color: "#0ca678"  },
  { label: "MACD",  value: 38, color: "#e8590c"  },
  { label: "ATR",   value: 22, color: "#d6336c"  },
];
 

const TRADE_COLUMNS: Column<Trade>[] = [
  { key: "symbol", label: "Symbol" },
  {
    key: "side",
    label: "Side",
    render: (v) => <Pill variant={v === "Long" ? "green" : "red" as PillVariant}>{v as string}</Pill>,
  },
  { key: "entry", label: "Entry" },
  { key: "exit",  label: "Exit"  },
  { key: "size",  label: "Size"  },
  {
    key: "pnl",
    label: "P&L",
    render: (v) => (
      <span style={{ color: String(v).startsWith("+") ? tokens.green : tokens.red }}>
        {v as string}
      </span>
    ),
  },
  { key: "rr",   label: "R:R"  },
  { key: "date", label: "Date", render: (v) => <span style={{ color: tokens.text3 }}>{v as string}</span> },
  { key: "note", label: "Note", render: (v) => <span style={{ fontStyle: "italic", color: tokens.text3 }}>{v as string}</span> },
];
 

// ── Page ─────────────────────────────────────────────────────
 
export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const {user, setUser} = useUser();

  useEffect(() => {
    fetchPortfolio().then(setPortfolio).catch(console.error);
  }, []);

  const rows = (portfolio?.history ?? []).map((t): Trade => ({
    symbol: t.symbol,
    side:   t.side.charAt(0).toUpperCase() + t.side.slice(1),
    entry:  `$${t.entry_price.toFixed(2)}`,
    exit:   t.exit_price != null ? `$${t.exit_price.toFixed(2)}` : "—",
    size:   t.quantity,
    pnl:    t.realised_pnl != null
            ? `${t.realised_pnl >= 0 ? "+" : "-"}$${t.realised_pnl.toFixed(2)}`
            : "—",
    rr:     "—",
    date:   new Date(t.opened_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    note:   "",
  }));

  return (
    <div style={{ background: tokens.bg0, minHeight: "100vh", padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
 
      {/* Header */}
      <PageHeader title={`Welcome back, ${user?.username}`} subtitle="Saturday, 9 May 2026 · Markets closed">
        <Btn>This week</Btn>
        <Btn primary>+ Log trade</Btn>
      </PageHeader>
 
      {/* Stat strip */}
      <StatRow>
        {STATS(portfolio).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} valueColor={s.color} />
        ))}
      </StatRow>
 
      {/* Row 1 — P&L chart + Favourite assets */}
      <Grid2>
        <Card title="P&L curve" action="Monthly ▾">
          <PnLChart
            data={toPnLCurve(portfolio?.history ?? [])}
            colors={{
              backgroundColor: 'transparent',
              textColor: tokens.text3,
            }}
          />
          
        </Card>
 
        <Card title="Favourite assets" action="✦ Edit" divided>
          {ASSETS.map((a) => (
            <Row key={a.symbol}>
              <Badge bg={a.bg} color={a.color}>{a.init}</Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: tokens.text0, fontSize: 13 }}>{a.symbol}</div>
                <div style={{ fontSize: 10, color: tokens.text3 }}>{a.name}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, color: tokens.text1, fontVariantNumeric: "tabular-nums" }}>{a.price}</div>
                <div style={{ fontSize: 10, color: a.up ? tokens.green : tokens.red }}>{a.change}</div>
              </div>
            </Row>
          ))}
        </Card>
      </Grid2>
 
      {/* Row 2 — Journal + Indicators */}
      <Grid2>
        <Card title="Journal — recent" action="See all →">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: `1px solid ${tokens.border}` }}>
            {Object.entries(
              JOURNAL(portfolio).reduce((groups, j) => {
                (groups[j.date] ??= []).push(j);
                return groups;
              }, {} as Record<string, ReturnType<typeof JOURNAL>>)
            ).map(([date, entries]) => (
              <div key={date} style={{ borderRight: `1px solid ${tokens.border}`, borderBottom: `1px solid ${tokens.border}`, padding: 8, minHeight: 80 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: tokens.text3, marginBottom: 6 }}>
                  {date}
                </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: entries[0].full_pnl >= 0 ? tokens.green : tokens.red, marginTop: 4, borderTop: `1px solid ${tokens.border}`, paddingTop: 4 }}>
                {entries[0].full_pnl >= 0 ? "+" : "-"}${Math.abs(entries[0].full_pnl).toFixed(2)}
              </div>
                {entries.map((j) => (
                <div key={j.id} style={{ fontSize: 11, color: j.up ? tokens.green : tokens.red, marginBottom: 2 }}>
                  {j.symbol} {j.pnl}
                </div>
                ))}
            </div>
            ))}
          </div>
        </Card>
 
        <Card title="Most used indicators" action="All time ▾" divided>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 11 }}>
            {INDICATORS.map((b) => (
              <BarRow key={b.label} label={b.label} value={b.value} max={92} color={b.color} count={b.value} />
            ))}
          </div>
          <CardFooter>🤖 Bots — coming soon</CardFooter>
        </Card>
      </Grid2>
 
      {/* Full-width trade history */}
      <Card title="Trade history" action="Full history →" divided>
        <DataTable
          columns={TRADE_COLUMNS}
          rows={rows}
        />
      </Card>
 
    </div>
  );
}