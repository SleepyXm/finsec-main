import { Portfolio } from "@/app/types/portfolio";


function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  const pos = value >= 0;
  return (
    <div className="flex flex-col gap-0.5 border-r border-zinc-800 last:border-r-0 px-3 py-2.5">
      <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${pos ? "text-emerald-400" : "text-red-400"}`}>
        {suffix
          ? `${pos ? "+" : ""}${value}${suffix}`
          : `${pos ? "+" : "−"}$${Math.abs(value).toFixed(2)}`}
      </span>
    </div>
  );
}

export default function RealisedPnL({ portfolio, loading }: {
  portfolio: Portfolio | null;
  loading: boolean;
}) {
  if (loading)
    return <p className="text-xs text-zinc-600">Loading…</p>;
  if (!portfolio || portfolio.history.length === 0)
    return <p className="text-xs text-zinc-600">No realised PnL history yet.</p>;

  const { stats, history } = portfolio;

  return (
    <div className="space-y-3">

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 rounded-lg border border-zinc-800 overflow-hidden">
        <StatCard label="Total PnL"   value={stats.total_realised_pnl} />
        <StatCard label="Win Rate"    value={stats.win_rate} suffix="%" />
        <StatCard label="Best Trade"  value={stats.best_trade} />
        <StatCard label="Worst Trade" value={stats.worst_trade} />
      </div>

      {/* Trade history */}
      <div className="max-h-60 overflow-y-auto space-y-px pr-px">
        {history.map((trade) => {
          const pnl = trade.realised_pnl ?? null;
          const pos = pnl !== null && pnl >= 0;
          return (
            <div
              key={trade.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
            >
              {/* Left: side badge + symbol + qty */}
              <div className="flex items-center gap-2 min-w-0">
                <span className={[
                  "shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                  trade.side === "long"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-red-500/10 text-red-400",
                ].join(" ")}>
                  {trade.side}
                </span>
                <span className="text-sm font-medium text-zinc-200 truncate">{trade.symbol}</span>
                <span className="text-xs text-zinc-600">×{trade.quantity}</span>
              </div>

              {/* Right: route + pnl */}
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-zinc-600 tabular-nums hidden sm:block">
                  {trade.entry_price} → {trade.exit_price ?? "—"}
                </span>
                <span className={[
                  "text-sm font-semibold tabular-nums w-20 text-right",
                  pnl === null ? "text-zinc-600" : pos ? "text-emerald-400" : "text-red-400",
                ].join(" ")}>
                  {pnl === null
                    ? "—"
                    : `${pos ? "+" : "−"}$${Math.abs(pnl).toFixed(2)}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}