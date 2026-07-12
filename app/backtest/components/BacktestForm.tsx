import { useState } from "react";
import { runBacktest } from "../services/backtest";
import { BacktestSession, BacktestCandle } from "@/app/types/backend";
import { theme, ACCENT, cornerStyle, panelStyle, Label } from "@/app/components/UI/UI";

const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "1d"];

interface Props {
  onSessionStart: (session: BacktestSession, candles: BacktestCandle[]) => void;
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
  const [interval, setInterval] = useState(defaultInterval);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [balance, setBalance]   = useState(100000);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await runBacktest(ticker.toUpperCase(), interval, dateFrom, dateTo, balance);
      onSessionStart(
        {
          session_id:       res.session_id,
          ticker:           res.ticker,
          interval:         res.interval,
          date_from:        dateFrom,
          date_to:          dateTo,
          starting_balance: res.starting_balance,
          candle_count:     res.candle_count,
          created_at:       new Date().toISOString(),
        },
        res.candles,
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header pill */}
      <div style={{ position: "relative", ...panelStyle(theme.dark), padding: "10px 14px" }}>
        <div style={cornerStyle()} />
        <p style={{
          color: theme.dark.muted2, fontSize: 11, margin: 0,
          letterSpacing: "0.06em", textTransform: "uppercase",
          fontFamily: "var(--font-code), monospace",
        }}>
          Configure Backtest
        </p>
      </div>

      {/* Ticker */}
      <div>
        <Label t={theme.dark}>Ticker</Label>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="e.g. NQ=F"
          style={inputStyle}
          required
        />
      </div>

      {/* Interval */}
      <div>
        <Label t={theme.dark}>Interval</Label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {INTERVALS.map((i) => {
            const active = interval === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setInterval(i)}
                style={{
                  padding: "4px 12px", fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit", borderRadius: 0,
                  background: active ? ACCENT : "transparent",
                  color:      active ? theme.dark.btnText : theme.dark.muted,
                  border: `1px solid ${active ? ACCENT : theme.dark.borderSoft}`,
                  transition: "all 0.15s ease",
                  letterSpacing: "0.02em",
                }}
              >
                {i}
              </button>
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
          style={inputStyle}
          required
        />
      </div>

      {error && (
        <p style={{ color: theme.dark.errorText, fontSize: 12, margin: 0 }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          background: ACCENT,
          color: theme.dark.btnText,
          border: "none",
          padding: "10px 0",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          opacity: loading ? 0.55 : 1,
          transition: "opacity 0.15s ease",
        }}
      >
        {loading ? "Loading…" : "Run Backtest"}
      </button>

    </form>
  );
}