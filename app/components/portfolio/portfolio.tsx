import { Portfolio } from "@/app/types/portfolio";

export default function RealisedPnL({ portfolio, loading }: {
  portfolio: Portfolio | null;
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-zinc-500">Loading...</p>;
  if (!portfolio || portfolio.history.length === 0)
    return <p className="text-sm text-zinc-500">No realised PnL history yet.</p>;

  const { stats, history } = portfolio;

  return (
    <div className="space-y-4">

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Total PnL",   value: stats.total_realised_pnl },
          { label: "Win Rate",    value: stats.win_rate, suffix: "%" },
          { label: "Best Trade",  value: stats.best_trade },
          { label: "Worst Trade", value: stats.worst_trade },
        ].map(({ label, value, suffix }) => (
          <div key={label} className="rounded-lg bg-zinc-800 px-3 py-2">
            <p className="text-xs text-zinc-400">{label}</p>
            <p className={`text-sm font-semibold ${value >= 0 ? "text-green-400" : "text-red-400"}`}>
              {value >= 0 ? "+" : ""}
              {suffix ? `${value}${suffix}` : `$${value.toFixed(2)}`}
            </p>
          </div>
        ))}
      </div>

      {/* Trade history list */}
      <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
        {history.map((trade) => (
          <div
            key={trade.id}
            className="flex items-center justify-between rounded-lg bg-zinc-800 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium uppercase px-1.5 py-0.5 rounded ${
                trade.side === "long" ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"
              }`}>
                {trade.side}
              </span>
              <span className="text-zinc-200 font-medium">{trade.symbol}</span>
              <span className="text-zinc-500 text-xs">×{trade.quantity}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-zinc-500 text-xs">
                {trade.entry_price} → {trade.exit_price ?? "—"}
              </span>
              <span className={`font-semibold w-20 text-right ${
                (trade.realised_pnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"
              }`}>
                {trade.realised_pnl !== null
                  ? `${trade.realised_pnl >= 0 ? "+" : ""}$${trade.realised_pnl.toFixed(2)}`
                  : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}