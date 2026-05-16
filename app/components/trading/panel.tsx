"use client";
import { useState, useEffect } from "react";
import OpenPositions from "./positions";
import RealisedPnL from "../portfolio/portfolio";
import { fetchPortfolio } from "@/app/handlers/portfolio";
import { Portfolio } from "@/app/types/portfolio";
import { OpenPositionsProps } from "@/app/types/trades";
import { usePortfolio, useAccountStats } from "@/app/hooks/usePortfolio";

type Tab = "unrealised" | "realised" | "positions";
const TABS: { key: Tab; label: string }[] = [
  { key: "unrealised", label: "Unrealised PnL" },
  { key: "realised",   label: "Orders"   },
  { key: "positions",  label: "Open Positions"  },
];

export default function TradingPanel({ positions, livePnLMap, onClose }: OpenPositionsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("unrealised");

  const { rows, loading, hasMore, sentinelRef } = usePortfolio();
  const { stats, loading: statsLoading }        = useAccountStats();

  const accountUnrealisedPnL = Object.values(livePnLMap).reduce((sum, pnl) => sum + pnl, 0);
  const isPositive = accountUnrealisedPnL >= 0;

  return (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-[#0d0f14] overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                "relative px-4 py-2.5 text-xs font-medium tracking-wide transition-colors duration-150 select-none",
                isActive
                  ? "text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-indigo-500 after:rounded-t"
                  : "text-zinc-500 hover:text-zinc-300",
              ].join(" ")}
            >
              {tab.label}
              {tab.key === "positions" && positions.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-semibold">
                  {positions.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="min-h-[120px] p-4">
        {activeTab === "unrealised" && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">
              Account Unrealised PnL
            </span>
            <span className={["text-2xl font-semibold tabular-nums", isPositive ? "text-emerald-400" : "text-red-400"].join(" ")}>
              {isPositive ? "+" : "−"}${Math.abs(accountUnrealisedPnL).toFixed(2)}
            </span>
          </div>
        )}

        {activeTab === "realised" && (
          <RealisedPnL
            rows={rows}
            stats={stats}
            loading={loading}
            statsLoading={statsLoading}
            hasMore={hasMore}
            sentinelRef={sentinelRef}
          />
        )}

        {activeTab === "positions" && (
          positions.length > 0
            ? <OpenPositions
                positions={positions}
                livePnLMap={livePnLMap}
                onClose={onClose}
                accountUnrealisedPnL={accountUnrealisedPnL}
              />
            : <p className="text-xs text-zinc-600">No open positions.</p>
        )}
      </div>
    </div>
  );
}