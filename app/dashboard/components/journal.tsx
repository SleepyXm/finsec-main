"use client";

import { useState, useRef } from "react";
import { Card, tokens } from "@/app/dashboard/components/dashboard";
import { useJournal } from "@/app/hooks/usePortfolio";
import { buildCalendarFromJournal } from "../constants/journal";
import { CalendarCell, CalendarTrade } from "../constants/journal";

const VISIBLE = 2;

function TradeRow({ t }: { t: CalendarTrade }) {
  return (
    <div style={{
      fontSize: 10,
      color: t.up ? tokens.green : tokens.red,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}>
      {t.symbol} {t.pnl}
    </div>
  );
}

function Popover({ trades, anchorRef }: { trades: CalendarTrade[]; anchorRef: React.RefObject<HTMLDivElement> }) {
  // Position below the cell
  const rect = anchorRef.current?.getBoundingClientRect();
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top:  (rect?.bottom ?? 0) + 4,
        left: (rect?.left   ?? 0),
        zIndex: 999,
        background: tokens.bg1,
        border: `1px solid ${tokens.border}`,
        borderRadius: 8,
        padding: "8px 10px",
        minWidth: 140,
        maxHeight: 220,
        overflowY: "auto",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {trades.map((t) => <TradeRow key={t.id} t={t} />)}
    </div>
  );
}

export function JournalCell({ cell }: { cell: CalendarCell }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null!);

  const profit  = cell.hasData && cell.pnl >= 0;
  const loss    = cell.hasData && cell.pnl < 0;
  const visible = cell.trades.slice(0, VISIBLE);
  const overflow = cell.trades.length - VISIBLE;

  return (
    <>
      <div
        ref={ref}
        style={{
          borderRight:     `1px solid ${tokens.border}`,
          borderBottom:    `1px solid ${tokens.border}`,
          minHeight:       72,
          padding:         "5px 6px",
          backgroundColor: profit ? `${tokens.green}18` : loss ? `${tokens.red}18` : "transparent",
          position:        "relative",
        }}
      >
        {/* Day number */}
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, color: cell.hasData ? (profit ? tokens.green : tokens.red) : tokens.text3 }}>
          {cell.day}
        </div>

        {/* Daily net P&L */}
        {cell.hasData && (
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: profit ? tokens.green : tokens.red }}>
            {cell.pnl >= 0 ? "+" : "-"}${Math.abs(cell.pnl).toFixed(2)}
          </div>
        )}

        {/* First 2 trades */}
        {visible.map((t) => <TradeRow key={t.id} t={t} />)}

        {/* Overflow badge */}
        {overflow > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            style={{
              marginTop: 2,
              fontSize: 9,
              color: tokens.text3,
              background: "none",
              border: `1px solid ${tokens.border}`,
              borderRadius: 4,
              padding: "1px 4px",
              cursor: "pointer",
              lineHeight: 1.4,
            }}
          >
            +{overflow} more
          </button>
        )}
      </div>

      {/* Popover — rendered outside cell to avoid clipping */}
      {open && (
        <>
          {/* Backdrop to close */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 998 }}
          />
          <Popover trades={cell.trades} anchorRef={ref} />
        </>
      )}
    </>
  );
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function prevMonth(current: string | undefined): string {
  const d = current ? new Date(`${current}-01`) : new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function nextMonth(current: string | undefined): string {
  const d = current ? new Date(`${current}-01`) : new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
}

export function Journal() {
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);
  const { journal } = useJournal(selectedMonth);
  const cal = buildCalendarFromJournal(journal, selectedMonth);

  return (
    <Card
      title={`Journal — ${cal.month} ${cal.year}`}
      action={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setSelectedMonth(prevMonth(selectedMonth))} style={{ background: "none", border: "none", color: tokens.text3, cursor: "pointer" }}>‹</button>
          <button onClick={() => setSelectedMonth(undefined)} style={{ background: "none", border: "none", color: tokens.text3, cursor: "pointer", fontSize: 11 }}>Today</button>
          <button onClick={() => setSelectedMonth(nextMonth(selectedMonth))} style={{ background: "none", border: "none", color: tokens.text3, cursor: "pointer" }}>›</button>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderLeft: `1px solid ${tokens.border}`, borderTop: `1px solid ${tokens.border}` }}>
        {DOW.map((d) => (
          <div key={d} style={{ padding: "4px 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: tokens.text3, textTransform: "uppercase", borderRight: `1px solid ${tokens.border}`, borderBottom: `1px solid ${tokens.border}` }}>
            {d}
          </div>
        ))}
        {cal.weeks.flatMap((week, wi) =>
          week.days.map((cell, di) =>
            !cell
              ? <div key={`pad-${wi}-${di}`} style={{ borderRight: `1px solid ${tokens.border}`, borderBottom: `1px solid ${tokens.border}`, minHeight: 72 }} />
              : <JournalCell key={cell.day} cell={cell} />
          )
        )}
      </div>
    </Card>
  );
}