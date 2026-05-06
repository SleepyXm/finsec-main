import { useState } from "react";
import { runBacktest } from "../services/backtest";
import { BacktestSession, BacktestCandle } from "@/app/types/backend";

const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "1d"];

interface Props {
  onSessionStart: (session: BacktestSession, candles: BacktestCandle[]) => void;
}

export default function BacktestForm({ onSessionStart }: Props) {
  const [ticker, setTicker]               = useState("");
  const [interval, setInterval]           = useState("5m");
  const [dateFrom, setDateFrom]           = useState("");
  const [dateTo, setDateTo]               = useState("");
  const [balance, setBalance]             = useState(100000);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);

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
    <form onSubmit={handleSubmit} className="max-w-md space-y-4 mt-8">
      <h2 className="text-xl font-bold">New Backtest</h2>

      <div className="space-y-1">
        <label className="text-sm text-zinc-400">Ticker</label>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="e.g. NQ=F"
          className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-white"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-zinc-400">Interval</label>
        <div className="flex gap-2 flex-wrap">
          {INTERVALS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInterval(i)}
              className={`px-3 py-1 rounded text-sm ${interval === i ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300"}`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm text-zinc-400">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-white"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-zinc-400">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-white"
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-zinc-400">Starting Balance ($)</label>
        <input
          type="number"
          value={balance}
          onChange={(e) => setBalance(Number(e.target.value))}
          className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-white"
          required
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Loading..." : "Run Backtest"}
      </button>
    </form>
  );
}