import { Portfolio } from "@/app/types/portfolio";
import { TradeHistoryRow } from "@/app/types/portfolio";
import { AccountStats } from "@/app/types/accounts";


interface RealisedPnLProps {
  rows: TradeHistoryRow[];
  stats: AccountStats | null;
  loading: boolean;
  statsLoading: boolean;
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

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

export default function RealisedPnL({ rows, stats, loading, statsLoading, hasMore, sentinelRef }: RealisedPnLProps) {
  if (loading && rows.length === 0)
    return <p className="text-xs text-zinc-600">Loading…</p>;
  if (!loading && rows.length === 0)
    return <p className="text-xs text-zinc-600">No realised PnL history yet.</p>;

  return (
    <div className="space-y-3">
      {/* Stats bar — from useAccountStats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 rounded-lg border border-zinc-800 overflow-hidden">
        {statsLoading || !stats ? (
          <p className="text-xs text-zinc-600 col-span-4 p-2">Loading stats…</p>
        ) : (
          <>
            <StatCard label="Total PnL"   value={stats.net_pnl} />
            <StatCard label="Win Rate"    value={stats.win_rate} suffix="%" />
            <StatCard label="Best Trade"  value={stats.best_trade} />
            <StatCard label="Worst Trade" value={stats.worst_trade} />
          </>
        )}
      </div>

      {/* Trade list — from usePortfolio */}
      <div className="max-h-60 overflow-y-auto space-y-px pr-px">
        {rows.map((row) => {
          const pnl = row.realised_pnl === "—" ? null : parseFloat(row.realised_pnl.replace(/[^0-9.-]/g, ""));
          const pos = pnl !== null && pnl >= 0;
          return (
            <div
              key={row.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={[
                  "shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                  row.side === "Long" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400",
                ].join(" ")}>
                  {row.side}
                </span>
                <span className="text-sm font-medium text-zinc-200 truncate">{row.symbol}</span>
                <span className="text-xs text-zinc-600">×{row.quantity}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-zinc-600 tabular-nums hidden sm:block">
                  {row.entry_price} → {row.exit_price}
                </span>
                <span className={[
                  "text-sm font-semibold tabular-nums w-20 text-right",
                  pnl === null ? "text-zinc-600" : pos ? "text-emerald-400" : "text-red-400",
                ].join(" ")}>
                  {row.realised_pnl}
                </span>
              </div>
            </div>
          );
        })}

        {/* Sentinel — watched by IntersectionObserver in usePortfolio */}
        <div ref={sentinelRef} style={{ height: 1 }} />

        {loading && (
          <p className="text-xs text-zinc-600 text-center py-2">Loading…</p>
        )}
        {!hasMore && rows.length > 0 && (
          <p className="text-xs text-zinc-600 text-center py-2">All trades loaded</p>
        )}
      </div>
    </div>
  );
}