"use client";

import { useState, useMemo } from "react";
import { useChartContext } from "../chartcontext";
import { IndicatorPanel } from "@/app/indicators/core/editor/IndicatorPanel";
import { AssetSearchBar, AssetListItem } from "@/app/assetsearch/assetsearchcomponents";
import { useAssetSearch } from "@/app/hooks/utility";
import { theme, cornerStyle } from "@/app/components/UI/UI";
import { CandleStickChart } from "../chartrender/charts/CandleStickChart";
import { ChartRenderer } from "@/app/chart/chartrender/ChartRenderer";
import BacktestForm from "@/app/backtest/components/BacktestForm";
import BacktestControls from "@/app/backtest/components/BacktestControls";
import BacktestStats from "@/app/backtest/components/BacktestStats";
import TradeButtons from "@/app/components/trading/tradebuttons";
import OpenPositions from "@/app/components/trading/positions";
import { usePositions } from "@/app/hooks/usePositions";
import { useTrades } from "@/app/hooks/useTrades";
import { BacktestSession, BacktestCandle } from "@/app/types/backend";

export type RightTab =
  | "watchlist" | "add-chart" | "strategy"
  | "backtest"  | "indicators" | "tools";

const RIGHT_TABS: { id: RightTab; label: string }[] = [
  { id: "add-chart",  label: "Add Chart"  },
  { id: "strategy",   label: "Strategy"   },
  { id: "backtest",   label: "Backtest"   },
  { id: "indicators", label: "Indicators" },
  { id: "watchlist",  label: "Watchlist"  },
  { id: "tools",      label: "Tools"      },
];

const RIGHT_PANEL_W      = 560;
const selectedBlurBg     = "rgba(238,242,247,0.085)";
const selectedBlurBorder = "rgba(238,242,247,0.26)";
const hoverBg            = "rgba(238,242,247,0.055)";
const idleBg             = "rgba(238,242,247,0.025)";

interface SavedStrategyPreview {
  id: string;
  label: string;
  symbol: string;
  interval: string;
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
}

interface RightPanelSectionProps {
  rightOpen:        boolean;
  setRightOpen:     React.Dispatch<React.SetStateAction<boolean>>;
  activeRightTab:   RightTab;
  setActiveRightTab:React.Dispatch<React.SetStateAction<RightTab>>;
  onAddChart:       (symbol: string) => void;
}

export function RightPanelSection({
  rightOpen, setRightOpen,
  activeRightTab, setActiveRightTab,
  onAddChart,
}: RightPanelSectionProps) {
  const [hoveredTab, setHoveredTab] = useState<RightTab | null>(null);

  return (
    <div style={{
      width:    rightOpen ? RIGHT_PANEL_W : 0,
      minWidth: rightOpen ? RIGHT_PANEL_W : 0,
      overflow: "hidden",
      borderLeft: `1px solid ${theme.dark.borderSoft}`,
      background: "rgba(14,17,23,0.92)",
      transition: "width 180ms ease, min-width 180ms ease",
      display: "flex", flexDirection: "column",
      zIndex: 40,
    }}>
      {/* tab grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 8, padding: 12,
        borderBottom: `1px solid ${theme.dark.borderSoft}`,
        flexShrink: 0,
      }}>
        {RIGHT_TABS.map((tab) => {
          const active  = activeRightTab === tab.id;
          const hovered = hoveredTab === tab.id && !active;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveRightTab(tab.id); setRightOpen(true); }}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                position: "relative", height: 56, borderRadius: 0,
                border: `1px solid ${active ? selectedBlurBorder : hovered ? theme.dark.border : theme.dark.borderSoft}`,
                background: active ? selectedBlurBg : hovered ? hoverBg : idleBg,
                color: active ? theme.dark.text : hovered ? theme.dark.muted : theme.dark.muted2,
                cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                letterSpacing: "0.02em", textTransform: "uppercase",
                backdropFilter:       active ? "blur(12px)" : undefined,
                WebkitBackdropFilter: active ? "blur(12px)" : undefined,
                transition: "background 0.16s ease, color 0.16s ease, border-color 0.16s ease",
              }}
            >
              {active && <div style={cornerStyle()} />}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* tab content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <TabContent activeTab={activeRightTab} onAddChart={onAddChart} />
      </div>
    </div>
  );
}

// ── tab content router ────────────────────────────────────────────────────────

function TabContent({ activeTab, onAddChart }: { activeTab: RightTab; onAddChart: (s: string) => void }) {
  switch (activeTab) {
    case "add-chart":  return <AddChartTab  onAddChart={onAddChart} />;
    case "strategy":   return <StrategyTab  />;
    case "backtest":   return <BacktestTab  />;
    case "indicators": return <IndicatorsTab />;
    default:           return <PlaceholderTab label={activeTab} />;
  }
}

// ── add chart ─────────────────────────────────────────────────────────────────

function AddChartTab({ onAddChart }: { onAddChart: (s: string) => void }) {
  const { assets, search } = useAssetSearch();
  const [resetKey, setResetKey] = useState(0);

  return (
    <div style={{ padding: 12 }}>
      <p style={{ color: theme.dark.muted2, fontSize: 11, marginBottom: 8, letterSpacing: "0.03em" }}>
        Search for an asset to add a side-by-side chart
      </p>

      <AssetSearchBar key={resetKey} onSearch={search} />

      {assets.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0 0" }}>
          {assets.map((asset) => (
            <AssetListItem
              key={asset.symbol}
              asset={asset}
              onSelect={() => {
                onAddChart(asset.symbol);
                search("");
                setResetKey((k) => k + 1);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── strategy ──────────────────────────────────────────────────────────────────

function StrategyTab() {
  const { isCreatingStrategy, setIsCreatingStrategy } = useChartContext();
  const savedStrategies: SavedStrategyPreview[] = [];
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const selectedStrategy = savedStrategies.find((strategy) => strategy.id === selectedStrategyId);

  return (
    <div style={{ padding: 12 }}>
      <p style={{ color: theme.dark.muted2, fontSize: 11, marginBottom: 12, letterSpacing: "0.03em" }}>
        Mark entry and exit points directly on the chart
      </p>

      <button
        onClick={() => setIsCreatingStrategy(!isCreatingStrategy)}
        style={{
          width: "100%", padding: "10px 0",
          background: isCreatingStrategy ? "#7c3aed" : idleBg,
          border: `1px solid ${isCreatingStrategy ? "#7c3aed" : theme.dark.borderSoft}`,
          borderRadius: 0,
          color: isCreatingStrategy ? "#fff" : theme.dark.muted,
          fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          letterSpacing: "0.03em",
          transition: "all 0.16s ease",
        }}
      >
        {isCreatingStrategy ? "⏹ Stop Annotating" : "▶ Start Annotating"}
      </button>

      {isCreatingStrategy && (
        <p style={{ color: "#a78bfa", fontSize: 11, marginTop: 8 }}>
          Click on the chart to place strategy points
        </p>
      )}

      <div style={{ marginTop: 18 }}>
        <p style={{ color: theme.dark.muted2, fontSize: 11, marginBottom: 8, letterSpacing: "0.03em" }}>
          Saved annotations
        </p>

        {savedStrategies.length === 0 ? (
          <p style={{ color: theme.dark.muted2, fontSize: 11 }}>
            No saved strategies yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {savedStrategies.map((strategy) => {
              const selected = strategy.id === selectedStrategyId;

              return (
                <button
                  key={strategy.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedStrategyId(selected ? null : strategy.id)}
                  style={{
                    width: "100%", padding: "9px 10px", textAlign: "left",
                    background: selected ? selectedBlurBg : idleBg,
                    border: `1px solid ${selected ? selectedBlurBorder : theme.dark.borderSoft}`,
                    borderRadius: 0, color: theme.dark.text,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <span style={{ display: "block", fontSize: 12 }}>
                    {strategy.label.replace(/_/g, " ")}
                  </span>
                  <span style={{ display: "block", color: theme.dark.muted2, fontSize: 10, marginTop: 3 }}>
                    {strategy.symbol} · {strategy.interval} · {strategy.candles.length} candles
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selectedStrategy && (
          <div style={{ height: 220, marginTop: 10, border: `1px solid ${theme.dark.borderSoft}` }}>
            {selectedStrategy.candles.length >= 2 ? (
              <CandleStickChart data={selectedStrategy.candles} />
            ) : (
              <p style={{ color: theme.dark.muted2, fontSize: 11, padding: 12 }}>
                This annotation does not contain a candle range.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── backtest ──────────────────────────────────────────────────────────────────

function BacktestTab() {
  const { shortname, interval } = useChartContext();

  const [session, setSession]   = useState<BacktestSession | null>(null);
  const [candles, setCandles]   = useState<BacktestCandle[]>([]);
  const [cursor, setCursor]     = useState(0);
  const [playing, setPlaying]   = useState(false);
  const [isCandle, setIsCandle] = useState(true);
  const [quantity, setQuantity] = useState(1);

  const visibleCandles = candles.slice(0, cursor);
  const currentCandle  = visibleCandles[visibleCandles.length - 1] ?? null;

  // Hooks must be called unconditionally — empty ticker is fine before session starts
  const { positions, setPositions } = usePositions(session?.ticker ?? "", true);
  const { placeTrade, closeTrade, error } = useTrades(positions, setPositions);

  const livePnLMap = positions.reduce<Record<string, number>>((acc, p) => {
    if (!currentCandle) return acc;
    const direction = p.side === "long" ? 1 : -1;
    acc[p.trade_id] = Math.round(
      (currentCandle.close - p.entry_price) * direction * p.quantity * 100,
    ) / 100;
    return acc;
  }, {});

  // Area series wants a `value` field; candlestick series wants OHLC
  const chartData = isCandle
    ? visibleCandles
    : visibleCandles.map((c) => ({ ...c, value: c.close }));

  function resetSession() {
    setSession(null);
    setCandles([]);
    setCursor(0);
    setPlaying(false);
  }

  // ── No session: show form ────────────────────────────────────────────────
  if (!session) {
    return (
      <div style={{ padding: 12 }}>
        <BacktestForm
          defaultTicker={shortname ?? ""}
          defaultInterval={interval ?? "5m"}
          onSessionStart={(sess, cands) => {
            setSession(sess);
            setCandles(cands);
            setCursor(0);
          }}
        />
      </div>
    );
  }

  // ── Session active: inline replay UI ────────────────────────────────────
  const tradeUI = currentCandle ? (
    <>
      {error && (
        <p style={{ color: "#f87171", fontSize: 11, marginBottom: 4 }}>{error}</p>
      )}
      <TradeButtons
        data={currentCandle}
        onTrade={(action, qty) =>
          placeTrade(action, currentCandle, session.ticker, qty, session.session_id)
        }
        quantity={quantity}
        onQuantityChange={setQuantity}
      />
    </>
  ) : undefined;

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header: ticker label + chart-type toggle + reset */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: theme.dark.text, fontSize: 13, fontWeight: 600 }}>
          {session.ticker} — Backtest
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {(["Candle", "Line"] as const).map((label) => {
            const active = label === "Candle" ? isCandle : !isCandle;
            return (
              <button
                key={label}
                onClick={() => setIsCandle(label === "Candle")}
                style={{
                  padding: "3px 10px", fontSize: 11, cursor: "pointer",
                  borderRadius: 0, fontFamily: "inherit",
                  background: active ? "#2563eb" : idleBg,
                  color:      active ? "#fff"    : theme.dark.muted,
                  border: `1px solid ${active ? "#2563eb" : theme.dark.borderSoft}`,
                  transition: "all 0.15s ease",
                }}
              >
                {label}
              </button>
            );
          })}
          <button
            onClick={resetSession}
            title="New backtest"
            style={{
              padding: "3px 8px", fontSize: 11, cursor: "pointer",
              borderRadius: 0, fontFamily: "inherit",
              background: idleBg,
              color: theme.dark.muted,
              border: `1px solid ${theme.dark.borderSoft}`,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 300, border: `1px solid ${theme.dark.borderSoft}` }}>
        {chartData.length > 0 ? (
          <ChartRenderer
            type={isCandle ? "candlestick" : "line"}
            data={chartData}
            positions={positions}
            livePnLMap={livePnLMap}
            renderTradeUI={tradeUI}
            onClosePosition={(id) =>
              closeTrade(id, currentCandle?.close ?? 0, session.session_id)
            }
            trades={[]}
          />
        ) : (
          <div style={{
            height: "100%", display: "flex",
            alignItems: "center", justifyContent: "center",
            color: theme.dark.muted2, fontSize: 12,
          }}>
            Press play to start replay…
          </div>
        )}
      </div>

      {/* Playback controls */}
      <BacktestControls
        session={session}
        cursor={cursor}
        setCursor={setCursor}
        totalCandles={candles.length}
        playing={playing}
        setPlaying={setPlaying}
      />

      {/* Stats strip */}
      <BacktestStats session={session} candles={visibleCandles} />

      {/* Open positions — only rendered when there's something to show */}
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

// ── indicators ────────────────────────────────────────────────────────────────

function IndicatorsTab() {
  return <IndicatorPanel />;
}

// ── generic placeholder ───────────────────────────────────────────────────────

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div style={{ padding: 12 }}>
      <div style={{
        position: "relative", padding: 14,
        color: theme.dark.muted2, fontSize: 12,
        border: `1px solid ${theme.dark.borderSoft}`,
        background: idleBg,
      }}>
        <div style={cornerStyle()} />
        {label} content
      </div>
    </div>
  );
}