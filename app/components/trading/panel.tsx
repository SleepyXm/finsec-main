"use client";

import { CSSProperties, useState } from "react";
import OpenPositions from "./positions";
import RealisedPnL from "../portfolio/portfolio";
import { OpenPositionsProps } from "@/app/components/types/trades";
import { usePortfolio, useAccountStats } from "@/app/components/hooks/usePortfolio";
import { theme, panelStyle, cornerStyle } from "@/app/UI";
import styles from "./TradingPanel.module.css";

type Tab = "realised" | "positions";

const TABS: { key: Tab; label: string }[] = [
  { key: "realised", label: "Orders" },
  { key: "positions", label: "Open Positions" },
];

export default function TradingPanel({
  positions,
  livePnLMap,
  onClose,
}: OpenPositionsProps) {
  const t = theme.dark;

  const [activeTab, setActiveTab] = useState<Tab>("realised");

  const { rows, loading, hasMore, sentinelRef } = usePortfolio();
  const { stats, loading: statsLoading, refresh: refreshStats } = useAccountStats();

  const accountUnrealisedPnL = Object.values(livePnLMap).reduce(
    (sum, pnl) => sum + pnl,
    0
  );

  const isPositive = accountUnrealisedPnL >= 0;

  const handleClose = async (tradeId: string) => {
    await onClose(tradeId);
    await refreshStats();
  };

  return (
    <div
      className="trading-panel"
      style={
        {
          ...panelStyle(t),
          "--tp-text": t.text,
          "--tp-muted": t.muted,
          "--tp-muted-2": t.muted2,
          "--tp-border": t.borderSoft,
          "--tp-border-strong": t.border,
          "--tp-accent": t.accent,
          "--tp-accent-soft": t.accentSoft,
          "--tp-accent-border": t.accentBorder,
          "--tp-success": t.successText,
          "--tp-error": t.errorText,
          "--tp-surface": t.surface,
          "--tp-surface-2": t.surface2,
        } as CSSProperties
      }
    >
      <div style={cornerStyle()} />

      <div className={styles.header}>
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

        <div className={styles.summary} aria-label="Profit and loss summary">
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Account Balance</span>
            <span className={styles.summaryValue}>
              {statsLoading || !stats
                ? "—"
                : `$${stats.balance.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
            </span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Unrealised PnL</span>
            <span
              className={[
                styles.summaryValue,
                isPositive ? styles.positive : styles.negative,
              ].join(" ")}
            >
              {isPositive ? "+" : "−"}$
              {Math.abs(accountUnrealisedPnL).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="trading-panel-content">
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
            <div className="trading-panel-scroll">
              <OpenPositions
                positions={positions}
                livePnLMap={livePnLMap}
                onClose={handleClose}
                accountUnrealisedPnL={accountUnrealisedPnL}
              />
            </div>
          ) : (
            <p className="trading-panel-empty">No open positions.</p>
          ))}
      </div>
    </div>
  );
}
