import { useState } from "react";
import { runBacktest } from "../services/backtest";
import { BacktestSession } from "@/app/types/backend";
import { CHART_INTERVALS, Interval, RawData } from "@/app/types/charts";
import { Label, MonoLabel, TraderBlankButton, buttonStyle, cornerStyle, theme, traderInsetPanelStyle } from "@/app/ui";

interface Props {
  onSessionStart: (session: BacktestSession, candles: RawData[]) => void;
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
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

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

    setTicker(normalizedTicker);
    setLoading(true);
    try {
      const res = await runBacktest(normalizedTicker, interval, dateFrom, dateTo, balance);
      onSessionStart(res, res.candles);
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
        <input
          type="number"
          value={balance}
          onChange={(e) => setBalance(Number(e.target.value))}
          min={1}
          max={1_000_000_000_000}
          step="0.01"
          style={inputStyle}
          required
        />
      </div>

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
