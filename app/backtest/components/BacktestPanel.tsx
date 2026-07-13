"use client";

import BacktestControls from "./BacktestControls";
import BacktestForm from "./BacktestForm";
import BacktestStats from "./BacktestStats";
import SavedBacktests from "./SavedBacktests";
import { useBacktestContext } from "./BacktestContext";
import OpenPositions from "@/app/components/trading/positions";
import { useChartContext } from "@/app/chart/chartcontext";
import { PnLChart } from "@/app/chart/chartrender/charts/PnLChart";
import {
  TraderBlankButton,
  cornerStyle,
  MonoLabel,
  theme,
  traderInsetPanelStyle,
  traderPanelStyle,
} from "@/app/ui";

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export default function BacktestPanel() {
  const { shortname, interval } = useChartContext();
  const {
    session,
    startSession,
    resetSession,
    resetReplay,
    candles,
    cursor,
    setCursor,
    playing,
    setPlaying,
    currentCandle,
    openPositions,
    livePnLMap,
    closeTrade,
    error,
    analysis,
  } = useBacktestContext();

  if (!session) {
    return (
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 18 }}>
        <BacktestForm
          defaultTicker={shortname ?? ""}
          defaultInterval={interval ?? "5m"}
          onSessionStart={startSession}
        />
        <SavedBacktests onResume={(backtest) => startSession(backtest, backtest.candles)} />
      </div>
    );
  }

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <header style={{ ...traderPanelStyle(theme.dark), padding: "10px 12px" }}>
        <div style={cornerStyle()} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ color: theme.dark.text, fontSize: 13, fontWeight: 600 }}>
            {session.ticker} <span style={{ color: theme.dark.accent }}>·</span> Backtest
          </div>
          <div style={{ color: theme.dark.muted2, fontSize: 11, marginTop: 2 }}>
            {session.interval} · {displayDate(session.date_from)} — {displayDate(session.date_to)}
          </div>
        </div>
        <TraderBlankButton
          onClick={resetSession}
          title="Exit backtest"
          style={{ padding: "6px 9px", fontSize: 9 }}
        >
          Exit
        </TraderBlankButton>
        </div>
      </header>

      <BacktestControls
        session={session}
        cursor={cursor}
        setCursor={setCursor}
        totalCandles={candles.length}
        playing={playing}
        setPlaying={setPlaying}
        onReset={resetReplay}
      />

      {error && (
        <div style={{ color: theme.dark.errorText, background: theme.dark.errorBg, padding: 9, fontSize: 10 }}>
          {error}
        </div>
      )}

      {analysis && (
        <section style={{ ...traderInsetPanelStyle(theme.dark), padding: "10px 10px 4px" }}>
          <div style={cornerStyle()} />
          <MonoLabel>P&amp;L curve</MonoLabel>
          <div style={{ marginTop: 6 }}>
            <PnLChart
              height={170}
              data={analysis.equityCurve.map((point) => ({
                time: point.time,
                value: point.value - session.starting_balance,
              }))}
              colors={{
                backgroundColor: "transparent",
                textColor: theme.dark.muted2,
              }}
            />
          </div>
        </section>
      )}

      {analysis && (
        <BacktestStats
          analysis={analysis}
          currentCandle={currentCandle}
          openPositions={openPositions.length}
        />
      )}

      {openPositions.length > 0 && (
        <OpenPositions
          positions={openPositions}
          livePnLMap={livePnLMap}
          onClose={(id) => closeTrade(id, currentCandle?.close ?? 0)}
        />
      )}
    </div>
  );
}
