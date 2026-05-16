"use client";

import { Btn, Badge, BarRow, Card, CardFooter, DataTable, Grid2, PageHeader, Row, Sep, StatCard, StatRow, tokens } from "@/app/dashboard/components/dashboard";
import { useState, useEffect } from "react";
import { fetchPortfolio } from "../handlers/portfolio";
import { Portfolio } from "../types/portfolio";
import { useUser } from "../provider/userprovider";
import { toPnLCurve } from "./components/functions";
import { fetchOpenPositions } from "../handlers/positions";
import { Trade } from "../types/trades";
import { PnLChart } from "../components/chartrender/charts/PnLChart";
import { TradeHistoryRow } from "../types/portfolio";
import { STATS } from "./constants/stats";
import { ASSETS } from "./constants/assets";
import { JOURNAL } from "./constants/journal";
import { INDICATORS } from "./constants/indicators";
import { TRADE_COLUMNS } from "./constants/tradeColumns";
import { buildCalendar } from "./constants/journal";

// ── Page ─────────────────────────────────────────────────────

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [openPositions, setOpenPositions] = useState<Trade[]>([]);
  const { user } = useUser();

  useEffect(() => {
    fetchPortfolio().then(setPortfolio).catch(console.error);
    fetchOpenPositions().then(setOpenPositions).catch(console.error);
  }, []);

  const rows = (portfolio?.history ?? []).map((t): TradeHistoryRow => ({
    id:     t.id,
    symbol: t.symbol,
    side:   t.side.charAt(0).toUpperCase() + t.side.slice(1),
    entry_price:  `$${t.entry_price.toFixed(2)}`,
    exit_price:   t.exit_price != null ? `$${t.exit_price.toFixed(2)}` : "—",
    quantity:   t.quantity,
    realised_pnl:    t.realised_pnl != null
            ? `${t.realised_pnl >= 0 ? "+" : "-"}$${t.realised_pnl.toFixed(2)}`
            : "—",
    rr:     "—",
    date:   new Date(t.opened_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    note:   "",
  }));

  const journalEntries = JOURNAL(portfolio);
  const cal = buildCalendar(journalEntries);
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div style={{ background: tokens.bg0, minHeight: "100vh", padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <PageHeader title={`Welcome back, ${user?.username}`} subtitle={`Date today: ${new Date().toLocaleDateString("en-GB")}`}>

      </PageHeader>

      {/* Stat strip */}
      <StatRow>
        {STATS(portfolio, openPositions).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} valueColor={s.color} />
        ))}
      </StatRow>

      {/* Row 1 — P&L chart + Favourite assets */}
      <Grid2>
        <Card title="P&L curve" action="Monthly ▾">
          <PnLChart
            data={toPnLCurve(portfolio?.history ?? [])}
            colors={{
              backgroundColor: "transparent",
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
        <Card title={`Journal — ${cal.month} ${cal.year}`} action="See all →">
  {/* Day-of-week header */}
  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    borderLeft: `1px solid ${tokens.border}`,
    borderTop: `1px solid ${tokens.border}`,
  }}>
    {DOW.map((d) => (
      <div key={d} style={{
        padding: "4px 6px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: tokens.text3,
        textTransform: "uppercase",
        borderRight: `1px solid ${tokens.border}`,
        borderBottom: `1px solid ${tokens.border}`,
      }}>
        {d}
      </div>
    ))}

    {/* Calendar cells */}
    {cal.weeks.flatMap((week, wi) =>
      week.days.map((cell, di) => {
        if (!cell) {
          // Empty padding cell
          return (
            <div key={`pad-${wi}-${di}`} style={{
              borderRight: `1px solid ${tokens.border}`,
              borderBottom: `1px solid ${tokens.border}`,
              minHeight: 72,
              backgroundColor: "transparent",
            }} />
          );
        }

        const profit = cell.hasData && cell.pnl >= 0;
        const loss   = cell.hasData && cell.pnl < 0;

        return (
          <div key={cell.day} style={{
            borderRight: `1px solid ${tokens.border}`,
            borderBottom: `1px solid ${tokens.border}`,
            minHeight: 72,
            padding: "5px 6px",
            backgroundColor: profit
              ? `${tokens.green}18`   // ~10% opacity tint
              : loss
              ? `${tokens.red}18`
              : "transparent",
            position: "relative",
          }}>
            {/* Day number */}
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: cell.hasData
                ? profit ? tokens.green : tokens.red
                : tokens.text3,
              marginBottom: 3,
            }}>
              {cell.day}
            </div>

            {/* Daily net P&L */}
            {cell.hasData && (
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: profit ? tokens.green : tokens.red,
                marginBottom: 4,
              }}>
                {cell.pnl >= 0 ? "+" : "-"}${Math.abs(cell.pnl).toFixed(2)}
              </div>
            )}

            {/* Individual trades */}
            {cell.trades.map((j) => (
              <div key={j.id} style={{
                fontSize: 10,
                color: j.up ? tokens.green : tokens.red,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {j.symbol} {j.pnl}
              </div>
            ))}
          </div>
        );
      })
    )}
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
        <DataTable columns={TRADE_COLUMNS} rows={rows} />
      </Card>

    </div>
  );
}