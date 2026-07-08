"use client";

import {
  Badge, BarRow, Btn, Card, CardFooter, DataTable,
  Grid2, PageHeader, Row, StatCard, StatRow, tokens,
} from "@/app/dashboard/components/dashboard";
import { gridBgStyle, pageStyle, theme } from "@/app/components/UI/UI";
import { useState } from "react";
import { useUser } from "../provider/userprovider";
import { usePortfolio, useAccountStats, usePnLCurve } from "../hooks/usePortfolio";
import { usePositions } from "../hooks/usePositions";
import { PnLChart } from "@/app/chart/chartrender/charts/PnLChart";
import { ASSETS } from "./constants/assets";
import { INDICATORS } from "./constants/indicators";
import { TRADE_COLUMNS } from "./constants/tradeColumns";
import { STATS } from "./constants/stats";
import { PnLPeriod } from "../types/accounts";
import { Journal } from "./components/journal";

export default function DashboardPage() {
  const { user } = useUser();

  const { rows, loading, hasMore, sentinelRef } = usePortfolio();
  const { stats }         = useAccountStats();
  const { positions: openPositions } = usePositions("");

  const [selectedPeriod, setSelectedPeriod] = useState<PnLPeriod>("month");

  const { curve }   = usePnLCurve(selectedPeriod);

  return (
    <div style={{ ...pageStyle, position: "relative", padding: "24px 28px 48px" }}>
      <div aria-hidden="true" style={{ ...gridBgStyle, opacity: 0.18 }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 16 }}>

      <PageHeader
        title={`Welcome back, ${user?.username}`}
        subtitle={`Date today: ${new Date().toLocaleDateString("en-GB")}`}
      />

      {/* Stat strip driven by useAccountStats */}
      <StatRow>
        {STATS(stats, openPositions).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} valueColor={s.color} />
        ))}
      </StatRow>

      <Grid2>
        {/* P&L chart driven by usePnLCurve */}
        <Card
          title="P&L curve"
          action={
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as PnLPeriod)}
              style={{ background: "transparent", color: theme.dark.muted2, border: "none", fontSize: 12, cursor: "pointer" }}
            >
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="all">All time</option>
            </select>
          }
        >
          <PnLChart
            data={curve?.points ?? []}
            colors={{ backgroundColor: "transparent", textColor: tokens.text3 }}
          />
        </Card>

        <Card title="Favourite assets" action={<Btn>Edit</Btn>} divided>
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

      <Grid2>
        {/* Journal calendar driven by useJournal */}
        <Journal />

        <Card title="Most used indicators" action={<Btn>All time</Btn>} divided>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 11 }}>
            {INDICATORS.map((b) => (
              <BarRow key={b.label} label={b.label} value={b.value} max={92} color={b.color} count={b.value} />
            ))}
          </div>
          <CardFooter>Bots - coming soon</CardFooter>
        </Card>
      </Grid2>

      {/* Paginated trade history */}
      <Card title="Trade history" action={<Btn>Full history</Btn>} divided>
        <div style={{ maxHeight: 400, overflowY: "auto", overflowX: "hidden" }}>
          <DataTable columns={TRADE_COLUMNS} rows={rows} />
          <div ref={sentinelRef} style={{ height: 1 }} />
          {loading && (
            <div style={{ padding: "12px 16px", fontSize: 12, color: tokens.text3, textAlign: "center" }}>Loading...</div>
          )}
          {!hasMore && rows.length > 0 && (
            <div style={{ padding: "12px 16px", fontSize: 12, color: tokens.text3, textAlign: "center" }}>All trades loaded</div>
          )}
        </div>
      </Card>

      </div>
    </div>
  );
}

