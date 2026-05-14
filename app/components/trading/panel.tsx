"use client";
import { useState, useEffect } from "react";
import OpenPositions from "./positions";
import RealisedPnL from "../portfolio/portfolio";
import { fetchPortfolio } from "@/app/handlers/portfolio";
import { Portfolio } from "@/app/types/portfolio";
import { OpenPositionsProps } from "@/app/types/trades";

type Tab = "unrealised" | "realised" | "positions";
const TABS: { key: Tab; label: string }[] = [
  { key: "unrealised", label: "Unrealised PnL" },
  { key: "realised",   label: "Orders"   },
  { key: "positions",  label: "Open Positions"  },
];

export default function TradingPanel({ positions, livePnLMap, onClose }: OpenPositionsProps) {
  const [activeTab, setActiveTab]     = useState<Tab>("unrealised");
  const [portfolio, setPortfolio]     = useState<Portfolio | null>(null);
  const [pnlLoading, setPnlLoading]   = useState(false);
  const [pnlFetched, setPnlFetched]   = useState(false);

  const accountUnrealisedPnL = Object.values(livePnLMap).reduce((sum, pnl) => sum + pnl, 0);

  function handleTabClick(tab: Tab) {
    setActiveTab(tab);
    // Fetch portfolio the first time the realised tab is opened
    if (tab === "realised" && !pnlFetched) {
      setPnlLoading(true);
      fetchPortfolio()
        .then(setPortfolio)
        .catch(console.error)
        .finally(() => {
          setPnlLoading(false);
          setPnlFetched(true);
        });
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900">
      <div className="flex border-b border-zinc-700">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabClick(tab.key)}
            className={`px-4 py-2 text-sm transition-colors duration-150 ${
              activeTab === tab.key
                ? "border-b-2 border-blue-500 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab.label}
            {tab.key === "positions" && positions.length > 0 && (
              <span className="ml-1.5 rounded-full bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                {positions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4 min-h-[120px]">
        {activeTab === "unrealised" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">Account Unrealised PnL</span>
            <span className={`text-lg font-semibold ${accountUnrealisedPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
              {accountUnrealisedPnL >= 0 ? "+" : ""}${accountUnrealisedPnL.toFixed(2)}
            </span>
          </div>
        )}
        {activeTab === "realised" && (
          <RealisedPnL portfolio={portfolio} loading={pnlLoading} />
        )}
        {activeTab === "positions" && (
          positions.length > 0
            ? <OpenPositions positions={positions} livePnLMap={livePnLMap} onClose={onClose} accountUnrealisedPnL={accountUnrealisedPnL} />
            : <p className="text-sm text-zinc-500">No open positions yet.</p>
        )}
      </div>
    </div>
  );
}