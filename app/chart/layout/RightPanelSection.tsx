"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useChartContext } from "../chartcontext";
import { IndicatorPanel } from "@/app/indicators/core/editor/IndicatorPanel";
import { AssetSearchBar, AssetListItem } from "@/app/assetsearch/assetsearchcomponents";
import { useAssetSearch } from "@/app/hooks/utility";
import { theme, cornerStyle } from "@/app/components/UI/UI";

export type RightTab =
  | "watchlist" | "add-chart" | "strategy"
  | "backtest"  | "indicators" | "tools";

const RIGHT_TABS: { id: RightTab; label: string }[] = [
  { id: "add-chart",  label: "Add Chart"  },
  { id: "strategy",   label: "Strategy"   },
  { id: "backtest",   label: "Backtest"   },
  { id: "indicators", label: "Indicators" },
  { id: "watchlist",  label: "Watchlist"  },
  { id: "tools",      label: "Tools"      },
];

const RIGHT_PANEL_W      = 560;
const selectedBlurBg     = "rgba(238,242,247,0.085)";
const selectedBlurBorder = "rgba(238,242,247,0.26)";
const hoverBg            = "rgba(238,242,247,0.055)";
const idleBg             = "rgba(238,242,247,0.025)";

interface RightPanelSectionProps {
  rightOpen:        boolean;
  setRightOpen:     React.Dispatch<React.SetStateAction<boolean>>;
  activeRightTab:   RightTab;
  setActiveRightTab:React.Dispatch<React.SetStateAction<RightTab>>;
  onAddChart:       (symbol: string) => void;
}

export function RightPanelSection({
  rightOpen, setRightOpen,
  activeRightTab, setActiveRightTab,
  onAddChart,
}: RightPanelSectionProps) {
  const [hoveredTab, setHoveredTab] = useState<RightTab | null>(null);

  return (
    <div style={{
      width:    rightOpen ? RIGHT_PANEL_W : 0,
      minWidth: rightOpen ? RIGHT_PANEL_W : 0,
      overflow: "hidden",
      borderLeft: `1px solid ${theme.dark.borderSoft}`,
      background: "rgba(14,17,23,0.92)",
      transition: "width 180ms ease, min-width 180ms ease",
      display: "flex", flexDirection: "column",
      zIndex: 40,
    }}>
      {/* tab grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 8, padding: 12,
        borderBottom: `1px solid ${theme.dark.borderSoft}`,
        flexShrink: 0,
      }}>
        {RIGHT_TABS.map((tab) => {
          const active  = activeRightTab === tab.id;
          const hovered = hoveredTab === tab.id && !active;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveRightTab(tab.id); setRightOpen(true); }}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                position: "relative", height: 56, borderRadius: 0,
                border: `1px solid ${active ? selectedBlurBorder : hovered ? theme.dark.border : theme.dark.borderSoft}`,
                background: active ? selectedBlurBg : hovered ? hoverBg : idleBg,
                color: active ? theme.dark.text : hovered ? theme.dark.muted : theme.dark.muted2,
                cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                letterSpacing: "0.02em", textTransform: "uppercase",
                backdropFilter:       active ? "blur(12px)" : undefined,
                WebkitBackdropFilter: active ? "blur(12px)" : undefined,
                transition: "background 0.16s ease, color 0.16s ease, border-color 0.16s ease",
              }}
            >
              {active && <div style={cornerStyle()} />}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* tab content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <TabContent activeTab={activeRightTab} onAddChart={onAddChart} />
      </div>
    </div>
  );
}

// ── tab content router ────────────────────────────────────────────────────────

function TabContent({ activeTab, onAddChart }: { activeTab: RightTab; onAddChart: (s: string) => void }) {
  switch (activeTab) {
    case "add-chart":  return <AddChartTab  onAddChart={onAddChart} />;
    case "strategy":   return <StrategyTab  />;
    case "backtest":   return <BacktestTab  />;
    case "indicators": return <IndicatorsTab />;
    default:           return <PlaceholderTab label={activeTab} />;
  }
}

// ── add chart ─────────────────────────────────────────────────────────────────

function AddChartTab({ onAddChart }: { onAddChart: (s: string) => void }) {
  const { assets, search } = useAssetSearch();
  const [resetKey, setResetKey] = useState(0);

  return (
    <div style={{ padding: 12 }}>
      <p style={{ color: theme.dark.muted2, fontSize: 11, marginBottom: 8, letterSpacing: "0.03em" }}>
        Search for an asset to add a side-by-side chart
      </p>

      <AssetSearchBar key={resetKey} onSearch={search} />

      {assets.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0 0" }}>
          {assets.map((asset) => (
            <AssetListItem
              key={asset.symbol}
              asset={asset}
              onSelect={() => {
                onAddChart(asset.symbol);
                search("");               // clear results
                setResetKey((k) => k + 1); // remount bar → clears input
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── strategy ──────────────────────────────────────────────────────────────────

function StrategyTab() {
  const { isCreatingStrategy, setIsCreatingStrategy } = useChartContext();

  return (
    <div style={{ padding: 12 }}>
      <p style={{ color: theme.dark.muted2, fontSize: 11, marginBottom: 12, letterSpacing: "0.03em" }}>
        Mark entry and exit points directly on the chart
      </p>

      <button
        onClick={() => setIsCreatingStrategy(!isCreatingStrategy)}
        style={{
          width: "100%", padding: "10px 0",
          background: isCreatingStrategy ? "#7c3aed" : idleBg,
          border: `1px solid ${isCreatingStrategy ? "#7c3aed" : theme.dark.borderSoft}`,
          borderRadius: 0,
          color: isCreatingStrategy ? "#fff" : theme.dark.muted,
          fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          letterSpacing: "0.03em",
          transition: "all 0.16s ease",
        }}
      >
        {isCreatingStrategy ? "⏹ Stop Annotating" : "▶ Start Annotating"}
      </button>

      {isCreatingStrategy && (
        <p style={{ color: "#a78bfa", fontSize: 11, marginTop: 8 }}>
          Click on the chart to place strategy points
        </p>
      )}
    </div>
  );
}

// ── backtest ──────────────────────────────────────────────────────────────────

function BacktestTab() {
  const router = useRouter();
  const { shortname, interval } = useChartContext();

  return (
    <div style={{ padding: 12 }}>
      <p style={{ color: theme.dark.muted2, fontSize: 11, marginBottom: 12, letterSpacing: "0.03em" }}>
        Run a backtest against {shortname} @ {interval}
      </p>

      <button
        onClick={() => router.push(`/backtest?ticker=${shortname}&interval=${interval}`)}
        style={{
          width: "100%", padding: "10px 0",
          background: idleBg,
          border: `1px solid ${theme.dark.borderSoft}`,
          borderRadius: 0,
          color: theme.dark.muted,
          fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          letterSpacing: "0.03em",
          transition: "background 0.16s ease",
        }}
      >
        Open Backtest →
      </button>
    </div>
  );
}

// ── indicators ────────────────────────────────────────────────────────────────

function IndicatorsTab() {
  return <IndicatorPanel />;
}

// ── generic placeholder ───────────────────────────────────────────────────────

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div style={{ padding: 12 }}>
      <div style={{
        position: "relative", padding: 14,
        color: theme.dark.muted2, fontSize: 12,
        border: `1px solid ${theme.dark.borderSoft}`,
        background: idleBg,
      }}>
        <div style={cornerStyle()} />
        {label} content
      </div>
    </div>
  );
}