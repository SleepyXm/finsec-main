"use client";

import {
  Btn,
  Badge,
  BarRow,
  Card,
  CardFooter,
  DataTable,
  Grid2,
  PageHeader,
  Row,
  Sep,
  StatCard,
  StatRow,
  tokens,
} from "@/app/dashboard/components/dashboard";
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
        <DataTable columns={TRADE_COLUMNS} rows={rows} />
      </Card>

    </div>
  );
}