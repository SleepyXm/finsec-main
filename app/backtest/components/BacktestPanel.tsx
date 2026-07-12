"use client";

import BacktestControls from "./BacktestControls";
import BacktestForm from "./BacktestForm";
import BacktestStats from "./BacktestStats";
import { useBacktestContext } from "./BacktestContext";
import OpenPositions from "@/app/components/trading/positions";
import { useChartContext } from "@/app/chart/chartcontext";
import { theme } from "@/app/components/UI/UI";

export default function BacktestPanel() {
  const { shortname, interval } = useChartContext();
  const {
    session,
    startSession,
    resetSession,
    candles,
    cursor,
    setCursor,
    playing,
    setPlaying,
    visibleCandles,
    currentCandle,
    positions,
    livePnLMap,
    closeTrade,
  } = useBacktestContext();

  if (!session) {
    return (
      <div style={{ padding: 12 }}>
        <BacktestForm
          defaultTicker={shortname ?? ""}
          defaultInterval={interval ?? "5m"}
          onSessionStart={startSession}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: theme.dark.text, fontSize: 13, fontWeight: 600 }}>
            {session.ticker} — Backtest
          </div>
          <div style={{ color: theme.dark.muted2, fontSize: 11, marginTop: 2 }}>
            {session.interval} · {session.date_from} to {session.date_to}
          </div>
        </div>
        <button
          type="button"
          onClick={resetSession}
          title="New backtest"
          style={{
            padding: "4px 9px",
            fontSize: 11,
            cursor: "pointer",
            borderRadius: 0,
            fontFamily: "inherit",
            background: "rgba(238,242,247,0.025)",
            color: theme.dark.muted,
            border: `1px solid ${theme.dark.borderSoft}`,
          }}
        >
          New
        </button>
      </div>

      <BacktestControls
        session={session}
        cursor={cursor}
        setCursor={setCursor}
        totalCandles={candles.length}
        playing={playing}
        setPlaying={setPlaying}
      />

      <BacktestStats session={session} candles={visibleCandles} />

      {positions.length > 0 && (
        <OpenPositions
          positions={positions}
          livePnLMap={livePnLMap}
          onClose={(id) =>
            closeTrade(id, currentCandle?.close ?? 0, session.session_id)
          }
        />
      )}
    </div>
  );
}
