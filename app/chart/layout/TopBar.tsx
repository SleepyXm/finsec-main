"use client";

import type React from "react";
import { useChartContext } from "../chartcontext";
import { Interval } from "@/app/types/charts";

function Select({ value, onChange, children }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: "relative", zIndex: 1, flexShrink: 0 }}>
      <select
        value={value}
        onChange={onChange}
        style={{
          height: 22,
          appearance: "none",
          background: "#0f1117",
          border: "1px solid #1e2130",
          borderRadius: 3,
          color: "#e2e8f0",
          fontSize: 10,
          padding: "1px 19px 1px 7px",
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.03em",
          outline: "none",
        }}
      >
        {children}
      </select>
      <svg
        width="7"
        height="7"
        viewBox="0 0 8 8"
        fill="none"
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: "#6b7280",
        }}
      >
        <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function TopBar() {
  const { interval, setInterval, intervals, isCandle, setIsCandle, connected } = useChartContext();

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      height: "100%",
      width: "100%",
      paddingInline: 8,
      gap: 8,
      overflow: "hidden",
    }}>
      <Select
        value={interval}
        onChange={(e) => setInterval(e.target.value as Interval)}
      >
        {intervals.map((int) => <option key={int} value={int}>{int}</option>)}
      </Select>

      <Select
        value={isCandle ? "candles" : "line"}
        onChange={(e) => setIsCandle(e.target.value === "candles")}
      >
        <option value="candles">Candles</option>
        <option value="line">Line</option>
      </Select>

      <div style={{
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
        paddingRight: 4,
      }}>
        <div style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: connected ? "#22c55e" : "#f59e0b",
          boxShadow: connected ? "0 0 4px #22c55e" : "0 0 4px #f59e0b",
        }} />
        <span style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.04em" }}>
          {connected ? "LIVE" : "CONNECTING"}
        </span>
      </div>
    </div>
  );
}

export function ChartQuoteStrip() {
  const { shortname, tick } = useChartContext();
  const change = tick ? tick.close - tick.open : 0;
  const changePct = tick && tick.open !== 0
    ? ((change / tick.open) * 100).toFixed(2)
    : "0.00";
  const isUp = change >= 0;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      minHeight: 24,
      padding: "3px 8px",
      border: "1px solid rgba(238,242,247,0.10)",
      background: "rgba(14,17,23,0.78)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      whiteSpace: "nowrap",
      pointerEvents: "none",
    }}>
      <span style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 650, letterSpacing: "0.04em" }}>
        {shortname}
      </span>
      {tick && (
        <>
          <OHLCItem label="O" value={tick.open} />
          <OHLCItem label="H" value={tick.high} color="#22c55e" />
          <OHLCItem label="L" value={tick.low} color="#ef4444" />
          <OHLCItem label="C" value={tick.close} />
          <span style={{ fontSize: 10, color: isUp ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
            {isUp ? "+" : ""}{change.toFixed(2)} ({isUp ? "+" : ""}{changePct}%)
          </span>
        </>
      )}
    </div>
  );
}

function OHLCItem({ label, value, color = "#8a90a0" }: { label: string; value: number; color?: string }) {
  return (
    <span style={{ fontSize: 10, color: "#4b5263" }}>
      {label} <span style={{ color }}>{value.toFixed(2)}</span>
    </span>
  );
}
