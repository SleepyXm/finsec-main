"use client";

import { useChartContext } from "../chartcontext";
import { Interval } from "@/app/types/charts";

function Select({ value, onChange, children, style }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ position: "relative", zIndex: 1, flexShrink: 0, ...style }}>
      <select
        value={value}
        onChange={onChange}
        style={{
          appearance: "none",
          background: "#0f1117",
          border: "1px solid #1e2130",
          borderRadius: 3,
          color: "#e2e8f0",
          fontSize: 11,
          padding: "2px 20px 2px 8px",
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.03em",
          outline: "none",
        }}
      >
        {children}
      </select>
      <svg
        width="8" height="8" viewBox="0 0 8 8" fill="none"
        style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#6b7280" }}
      >
        <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function TopBar() {
  const { shortname, tick, interval, setInterval, intervals, isCandle, setIsCandle, connected } = useChartContext();

  const change    = tick ? tick.close - tick.open : 0;
  const changePct = tick ? ((change / tick.open) * 100).toFixed(2) : "0.00";
  const isUp      = change >= 0;

  return (
    <div style={{
      display: "flex", alignItems: "center",
      height: "100%", width: "100%",
      paddingLeft: 12, paddingRight: 8,
      gap: 0, overflow: "hidden",
    }}>
      {/* ticker + OHLC */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        paddingRight: 16,
        borderRight: "1px solid #1e2130",
        marginRight: 12, flexShrink: 0,
      }}>
        <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, letterSpacing: "0.04em" }}>
          {shortname}
        </span>
        {tick && (
          <>
            <OHLCItem label="O" value={tick.open} />
            <OHLCItem label="H" value={tick.high} color="#22c55e" />
            <OHLCItem label="L" value={tick.low}  color="#ef4444" />
            <OHLCItem label="C" value={tick.close} />
            <span style={{ fontSize: 11, color: isUp ? "#22c55e" : "#ef4444", fontWeight: 500 }}>
              {isUp ? "+" : ""}{change.toFixed(2)} ({isUp ? "+" : ""}{changePct}%)
            </span>
          </>
        )}
      </div>

      {/* interval */}
      <Select
        value={interval}
        onChange={(e) => setInterval(e.target.value as Interval)}
        style={{ marginRight: 12, borderRight: "1px solid #1e2130", paddingRight: 20 }}
      >
        {intervals.map((int) => <option key={int} value={int}>{int}</option>)}
      </Select>

      {/* chart type */}
      <Select
        value={isCandle ? "candles" : "line"}
        onChange={(e) => setIsCandle(e.target.value === "candles")}
      >
        <option value="candles">Candles</option>
        <option value="line">Line</option>
      </Select>

      {/* connection dot */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, flexShrink: 0, paddingRight: 8 }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background:  connected ? "#22c55e" : "#f59e0b",
          boxShadow:   connected ? "0 0 4px #22c55e" : "0 0 4px #f59e0b",
        }} />
        <span style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.04em" }}>
          {connected ? "LIVE" : "CONNECTING"}
        </span>
      </div>
    </div>
  );
}

function OHLCItem({ label, value, color = "#8a90a0" }: { label: string; value: number; color?: string }) {
  return (
    <span style={{ fontSize: 11, color: "#4b5263" }}>
      {label} <span style={{ color }}>{value?.toFixed(2)}</span>
    </span>
  );
}