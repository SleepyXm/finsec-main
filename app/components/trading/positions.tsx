import { Trade, OpenPositionsProps } from "@/app/types/trades";

export default function OpenPositions({ positions, livePnLMap, onClose }: OpenPositionsProps) {
  if (!positions.length) return null;

  return (
    <ul className="space-y-px">
      {positions.map((position) => {
        const id = position.position_id ?? (position as any).id;
        const livePnL = livePnLMap[id] ?? 0;
        const pos = livePnL >= 0;

        return (
          <li
            key={id}
            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
          >
            {/* Left: badge + symbol + meta */}
            <div className="flex items-center gap-2 min-w-0">
              <span className={[
                "shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                position.side === "long"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400",
              ].join(" ")}>
                {position.side}
              </span>
              <span className="text-sm font-medium text-zinc-200 truncate">{position.symbol}</span>
              <span className="text-xs text-zinc-600">×{position.quantity}</span>
              <span className="text-xs text-zinc-600 hidden sm:block">
                entry ${position.entry_price.toFixed(2)}
              </span>
            </div>

            {/* Right: live pnl + close */}
            <div className="flex items-center gap-3 shrink-0">
              <span className={[
                "text-sm font-semibold tabular-nums w-20 text-right",
                pos ? "text-emerald-400" : "text-red-400",
              ].join(" ")}>
                {pos ? "+" : "−"}${Math.abs(livePnL).toFixed(2)}
              </span>
              <button
                onClick={() => onClose(id)}
                aria-label="Close position"
                className="w-6 h-6 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 text-xs transition-colors"
              >
                ✕
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}