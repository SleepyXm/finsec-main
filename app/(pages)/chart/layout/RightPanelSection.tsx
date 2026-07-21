"use client";

import { useEffect, useState } from "react";
import { IndicatorPanel } from "@/app/features/indicators/core/editor/IndicatorPanel";
import { AssetSearchBar, AssetListItem } from "@/app/features/assetsearch/assetsearchcomponents";
import { useAssetSearch } from "@/app/components/hooks/utility";
import { theme, cornerStyle } from "@/app/UI";
import BacktestPanel from "@/app/features/backtest/components/BacktestPanel";
import { ChartTheme } from "@/app/(pages)/chart/chartrender/themes/themes";
import StrategyPanel from "./StrategyPanel";
import { useChartContext } from "../chartcontext";

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

const RIGHT_PANEL_W      = "clamp(360px, 22vw, 440px)";
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
  chartTheme:       ChartTheme;
}

export function RightPanelSection({
  rightOpen, setRightOpen,
  activeRightTab, setActiveRightTab,
  onAddChart,
  chartTheme,
}: RightPanelSectionProps) {
  const [hoveredTab, setHoveredTab] = useState<RightTab | null>(null);
  const { closeStrategyTeaching } = useChartContext();
  useEffect(() => {
    if (activeRightTab !== "strategy") closeStrategyTeaching();
  }, [activeRightTab, closeStrategyTeaching]);

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
        <TabContent activeTab={activeRightTab} onAddChart={onAddChart} chartTheme={chartTheme} />
      </div>
    </div>
  );
}

// ── tab content router ────────────────────────────────────────────────────────

function TabContent({
  activeTab,
  onAddChart,
  chartTheme,
}: {
  activeTab: RightTab;
  onAddChart: (s: string) => void;
  chartTheme: ChartTheme;
}) {
  switch (activeTab) {
    case "add-chart":  return <AddChartTab  onAddChart={onAddChart} />;
    case "strategy":   return <StrategyPanel chartTheme={chartTheme} />;
    case "backtest":   return <BacktestPanel />;
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
                search("");
                setResetKey((k) => k + 1);
              }}
            />
          ))}
        </ul>
      )}
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
