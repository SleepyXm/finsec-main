"use client";

import { useState, useRef } from "react";
import { cornerStyle, panelStyle, theme } from "@/app/UI";
import { Btn, Card, tokens } from "@/app/(pages)/dashboard/components/dashboard";
import { useJournal } from "@/app/components/hooks/usePortfolio";
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

type PopoverPosition = {
  top: number;
  left: number;
};

function Popover({ trades, position }: { trades: CalendarTrade[]; position: PopoverPosition }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        ...panelStyle(theme.dark),
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 999,
        padding: "8px 10px",
        minWidth: 140,
        maxHeight: 220,
        overflowY: "auto",
        boxShadow: "0 18px 48px rgba(0,0,0,0.38)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div aria-hidden="true" style={cornerStyle()} />
      {trades.map((t) => <TradeRow key={t.id} t={t} />)}
    </div>
  );
}

export function JournalCell({ cell }: { cell: CalendarCell }) {
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const ref = useRef<HTMLDivElement>(null!);

  const profit  = cell.hasData && cell.pnl >= 0;
  const loss    = cell.hasData && cell.pnl < 0;
  const visible = cell.trades.slice(0, VISIBLE);
  const overflow = cell.trades.length - VISIBLE;
  const cellBg = profit ? `${tokens.green}18` : loss ? `${tokens.red}18` : "transparent";

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = tokens.hover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = cellBg;
        }}
        style={{
          borderRight:     `1px solid ${tokens.border}`,
          borderBottom:    `1px solid ${tokens.border}`,
          minHeight:       72,
          padding:         "5px 6px",
          backgroundColor: cellBg,
          position:        "relative",
          overflow:        "hidden",
          transition:      "background 0.12s ease",
        }}
      >
        <div aria-hidden="true" style={{ ...cornerStyle(), opacity: cell.hasData ? 0.4 : 0.2 }} />
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
            onClick={(e) => {
              e.stopPropagation();
              const rect = ref.current?.getBoundingClientRect();
              setPopoverPosition(rect ? { top: rect.bottom + 4, left: rect.left } : null);
              setOpen((o) => !o);
            }}
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

      {/* Popover rendered outside cell to avoid clipping */}
      {open && (
        <>
          {/* Backdrop to close */}
          <div
            onClick={() => {
              setOpen(false);
              setPopoverPosition(null);
            }}
            style={{ position: "fixed", inset: 0, zIndex: 998 }}
          />
          {popoverPosition && <Popover trades={cell.trades} position={popoverPosition} />}
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
      title={`Journal - ${cal.month} ${cal.year}`}
      action={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Btn onClick={() => setSelectedMonth(prevMonth(selectedMonth))}>Prev</Btn>
          <Btn onClick={() => setSelectedMonth(undefined)}>Today</Btn>
          <Btn onClick={() => setSelectedMonth(nextMonth(selectedMonth))}>Next</Btn>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderLeft: `1px solid ${tokens.border}`, borderTop: `1px solid ${tokens.border}` }}>
        {DOW.map((d) => (
          <div key={d} style={{ padding: "4px 6px", fontSize: 10, fontWeight: 700, letterSpacing: 0, color: tokens.text3, textTransform: "uppercase", borderRight: `1px solid ${tokens.border}`, borderBottom: `1px solid ${tokens.border}` }}>
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
