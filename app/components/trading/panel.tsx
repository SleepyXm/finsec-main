"use client";

import { useState } from "react";
import OpenPositions from "./positions";
import RealisedPnL from "../portfolio/portfolio";
import { OpenPositionsProps } from "@/app/types/trades";
import { usePortfolio, useAccountStats } from "@/app/hooks/usePortfolio";
import { theme, panelStyle, cornerStyle } from "@/app/components/UI/UI";

type Tab = "unrealised" | "realised" | "positions";

const TABS: { key: Tab; label: string }[] = [
  { key: "unrealised", label: "Unrealised PnL" },
  { key: "realised", label: "Orders" },
  { key: "positions", label: "Open Positions" },
];

export default function TradingPanel({
  positions,
  livePnLMap,
  onClose,
}: OpenPositionsProps) {
  const t = theme.dark;

  const [activeTab, setActiveTab] = useState<Tab>("unrealised");

  const { rows, loading, hasMore, sentinelRef } = usePortfolio();
  const { stats, loading: statsLoading } = useAccountStats();

  const accountUnrealisedPnL = Object.values(livePnLMap).reduce(
    (sum, pnl) => sum + pnl,
    0
  );

  const isPositive = accountUnrealisedPnL >= 0;

  return (
    <div
      className="trading-panel"
      style={{
        ...panelStyle(t),
        borderRadius: 12,
        padding: "1rem",
      }}
    >
      <div style={cornerStyle()} />

      <div className="trading-panel-tabs">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                "trading-panel-tab",
                isActive ? "trading-panel-tab-active" : "",
              ].join(" ")}
            >
              {tab.label}

              {tab.key === "positions" && positions.length > 0 && (
                <span className="trading-panel-tab-count">
                  {positions.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="trading-panel-content">
        {activeTab === "unrealised" && (
          <div className="trading-panel-metric">
            <span className="trading-panel-metric-label">
              Account Unrealised PnL
            </span>

            <span
              className={[
                "trading-panel-metric-value",
                isPositive
                  ? "trading-panel-metric-value-positive"
                  : "trading-panel-metric-value-negative",
              ].join(" ")}
            >
              {isPositive ? "+" : "−"}$
              {Math.abs(accountUnrealisedPnL).toFixed(2)}
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

        {activeTab === "positions" &&
          (positions.length > 0 ? (
            <OpenPositions
              positions={positions}
              livePnLMap={livePnLMap}
              onClose={onClose}
              accountUnrealisedPnL={accountUnrealisedPnL}
            />
          ) : (
            <p className="trading-panel-empty">No open positions.</p>
          ))}
      </div>
    </div>
  );
}