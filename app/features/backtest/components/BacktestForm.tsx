import { useEffect, useState } from "react";
import { runBacktest } from "../services/backtest";
import { BacktestSession } from "@/app/components/types/backend";
import { CHART_INTERVALS, Interval, RawData } from "@/app/components/types/charts";
import { Label, MonoLabel, TraderBlankButton, buttonStyle, cornerStyle, theme, traderInsetPanelStyle } from "@/app/UI";
import {
  getUserStrategy,
  listUserStrategies,
  type SavedStrategy,
} from "@/app/components/handlers/annotations";
import type { BacktestStrategyConfig } from "./BacktestContext";
import { NumberStepper } from "@/app/UI/client";

interface Props {
  onSessionStart: (
    session: BacktestSession,
    candles: RawData[],
    strategy?: BacktestStrategyConfig | null,
  ) => void;
  defaultTicker?: string;
  defaultInterval?: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: theme.dark.bg2,
  border: `1px solid ${theme.dark.borderSoft}`,
  color: theme.dark.text,
  padding: "8px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

export default function BacktestForm({ onSessionStart, defaultTicker = "", defaultInterval = "5m" }: Props) {
  const [ticker, setTicker]     = useState(defaultTicker);
  const initialInterval = CHART_INTERVALS.includes(defaultInterval as Interval)
    ? defaultInterval as Interval
    : "5m";
  const [interval, setInterval] = useState<Interval>(initialInterval);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [balance, setBalance]   = useState(100000);
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [strategyId, setStrategyId] = useState("");
  const [formationPercent, setFormationPercent] = useState(50);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    void listUserStrategies()
      .then((items) => {
        if (!cancelled) {
          setStrategies(items);
          setStrategyError(null);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setStrategyError(cause instanceof Error ? cause.message : "Could not load strategies.");
        }
      });
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const normalizedTicker = ticker.trim().toUpperCase();
    if (!/^[A-Z0-9.^=_-]{1,24}$/.test(normalizedTicker)) {
      setError("Enter a valid ticker using at most 24 letters, numbers, or market-symbol characters.");
      return;
    }
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      setError("The start date must be on or before the end date.");
      return;
    }
    if (dateTo > today) {
      setError("The end date cannot be in the future.");
      return;
    }
    if (!Number.isFinite(balance) || balance < 1 || balance > 1_000_000_000_000) {
      setError("Starting balance must be between 1 and 1,000,000,000,000.");
      return;
    }
    if (
      strategyId &&
      (!Number.isFinite(formationPercent) || formationPercent < 1 || formationPercent > 100)
    ) {
      setError("Formation recognition must be between 1% and 100%.");
      return;
    }

    setTicker(normalizedTicker);
    setLoading(true);
    try {
      const [res, details] = await Promise.all([
        runBacktest(normalizedTicker, interval, dateFrom, dateTo, balance),
        strategyId ? getUserStrategy(strategyId) : Promise.resolve(null),
      ]);
      if (details && !details.snapshots.some(({ candles }) => candles.length)) {
        throw new Error("The selected strategy has no usable snapshots.");
      }
      const strategy = details ? {
        strategyId: details.id,
        strategyLabel: details.title.replace(/_/g, " "),
        snapshots: details.snapshots.filter(({ candles }) => candles.length),
        formationPercent,
      } : null;
      onSessionStart(res, res.candles, strategy);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start backtest.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      <div style={{ ...traderInsetPanelStyle(theme.dark), padding: "10px 12px" }}>
        <div style={cornerStyle()} />
        <MonoLabel>Configure backtest</MonoLabel>
      </div>

      {/* Ticker */}
      <div>
        <Label t={theme.dark}>Ticker</Label>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          maxLength={24}
          placeholder="e.g. NQ=F"
          style={inputStyle}
          required
        />
      </div>

      {/* Interval */}
      <div>
        <Label t={theme.dark}>Interval</Label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CHART_INTERVALS.map((i) => {
            const active = interval === i;
            return (
              <TraderBlankButton
                key={i}
                active={active}
                onClick={() => setInterval(i)}
                style={{
                  padding: "6px 10px", fontSize: 10,
                  letterSpacing: "0.02em",
                }}
              >
                {i}
              </TraderBlankButton>
            );
          })}
        </div>
      </div>

      {/* Date range */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <Label t={theme.dark}>From</Label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            max={dateTo || today}
            style={inputStyle}
            required
          />
        </div>
        <div>
          <Label t={theme.dark}>To</Label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            min={dateFrom || undefined}
            max={today}
            style={inputStyle}
            required
          />
        </div>
      </div>

      {/* Balance */}
      <div>
        <Label t={theme.dark}>Starting Balance ($)</Label>
        <NumberStepper
          value={balance}
          onChange={setBalance}
          min={1}
          max={1_000_000_000_000}
          step={0.01}
          ariaLabel="Starting balance"
          style={{ width: "100%", height: 34 }}
        />
      </div>

      <div style={{ ...traderInsetPanelStyle(theme.dark), padding: "10px 12px" }}>
        <div style={cornerStyle()} />
        <Label t={theme.dark}>Strategy guidance (optional)</Label>
        <select
          value={strategyId}
          onChange={(event) => setStrategyId(event.target.value)}
          disabled={loading}
          style={{ ...inputStyle, marginTop: 3 }}
        >
          <option value="">None — manual backtest</option>
          {strategies.map((strategy) => (
            <option key={strategy.id} value={strategy.id}>
              {strategy.title.replace(/_/g, " ")} · {strategy.snapshot_count} snapshots
            </option>
          ))}
        </select>

        {strategyId && (
          <div style={{ marginTop: 10 }}>
            <Label t={theme.dark}>Recognise formation after (%)</Label>
            <NumberStepper
              value={formationPercent}
              onChange={setFormationPercent}
              min={1}
              max={100}
              step={1}
              integer
              ariaLabel="Formation recognition percentage"
              style={{ width: "100%", height: 34 }}
            />
            <p style={{ color: theme.dark.muted2, fontSize: 9, lineHeight: 1.5, margin: "6px 0 0" }}>
              Replay validates each revealed candle and highlights the strongest forming window.
            </p>
          </div>
        )}
      </div>

      {strategyError && (
        <p style={{ color: theme.dark.muted2, fontSize: 10, margin: 0 }}>
          Strategies unavailable: {strategyError}
        </p>
      )}

      {error && (
        <p style={{ color: theme.dark.errorText, background: theme.dark.errorBg, padding: 9, fontSize: 10, margin: 0 }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          ...buttonStyle(theme.dark),
          width: "100%",
          padding: "10px 0",
          fontSize: 11,
          letterSpacing: "0.08em",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.55 : 1,
        }}
      >
        {loading ? "Loading…" : "Run Backtest"}
      </button>

    </form>
  );
}
