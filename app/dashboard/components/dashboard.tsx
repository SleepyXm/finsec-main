// components/ui/dashboard.tsx
// ─────────────────────────────────────────────────────────────
//  Hyjacked — Dashboard UI primitives
//  All styling lives here. Pages just import and fill data in.
// ─────────────────────────────────────────────────────────────

"use client";

import { ReactNode } from "react";
 
// ── Tokens ───────────────────────────────────────────────────
export const tokens = {
  bg0:      "#0e101800",
  bg1:      "#1a1a1a5b",
  bg2:      "#161616",
  bg3:      "#20233a",
  border:   "#252838",
  borderHi: "#2e3248",
  text0:    "#ffffff",
  text1:    "#e2e4ef",
  text2:    "#8b8fa8",
  text3:    "#5a5e78",
  green:    "#4ade80",
  greenDim: "rgba(74,222,128,0.10)",
  red:      "#f87171",
  redDim:   "rgba(248,113,113,0.10)",
  blue:     "#748ffc",
  blueDim:  "rgba(116,143,252,0.12)",
  accent:   "#3b5bdb",
} as const;
 
// ── Types ────────────────────────────────────────────────────
export type PillVariant = "green" | "red" | "blue" | "muted";
 
export interface Column<T = Record<string, unknown>> {
  key: keyof T;
  label: string;
  className?: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
}
 
// ─────────────────────────────────────────────────────────────
//  LAYOUT
// ─────────────────────────────────────────────────────────────
 
/** Full-width two-column grid */
export function Grid2({
  children,
  ratio = "1fr 1fr",
}: {
  children: ReactNode;
  ratio?: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: ratio, gap: 16 }}>
      {children}
    </div>
  );
}
 
/** Evenly-spaced stat strip — auto-fits N children */
export function StatRow({ children }: { children: ReactNode[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${children.length}, 1fr)`,
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}
 
/** Welcome / page header row */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 500, color: tokens.text0 }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: tokens.text3, marginTop: 3 }}>{subtitle}</div>
        )}
      </div>
      {children && <div style={{ display: "flex", gap: 8 }}>{children}</div>}
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────
//  CARD FAMILY
// ─────────────────────────────────────────────────────────────
 
/**
 * Card — universal surface.
 *
 * `divided` — children manage their own padding (use for Row lists / tables).
 * default  — wraps content in a padded body div.
 */
export function Card({
  title,
  action,
  divided = false,
  children,
}: {
  title?: string;
  action?: ReactNode;
  divided?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ background: tokens.bg1, border: `0.5px solid ${tokens.border}`, borderRadius: 14, overflow: "hidden" }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px 12px", borderBottom: `0.5px solid ${tokens.border}` }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: tokens.text2, letterSpacing: "0.5px", textTransform: "uppercase" }}>
            {title}
          </span>
          {action && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: tokens.text3 }}>
              {action}
            </div>
          )}
        </div>
      )}
      {divided ? children : <div style={{ padding: "14px 16px" }}>{children}</div>}
    </div>
  );
}
 
/** Separator — horizontal rule between row groups inside a divided Card */
export function Sep() {
  return (
    <hr style={{ border: "none", borderTop: `0.5px solid ${tokens.border}`, margin: 0 }} />
  );
}
 
/** Footer strip at the bottom of a Card */
export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "9px 16px",
        borderTop: `0.5px solid ${tokens.border}`,
        fontSize: 11,
        color: tokens.text3,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </div>
  );
}
 
/**
 * StatCard — metric tile with elevated bg.
 * valueColor: any CSS colour string, or use tokens.green / tokens.red
 */
export function StatCard({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  valueColor?: string;
}) {
  return (
    <div style={{ background: tokens.bg2, borderRadius: 12, padding: "14px 16px" }}>
      <div
        style={{
          fontSize: 10,
          color: tokens.text3,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.6px",
          color: valueColor ?? tokens.text0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, marginTop: 4, color: tokens.text3 }}>{sub}</div>
      )}
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────
//  ROW / LIST ITEMS
// ─────────────────────────────────────────────────────────────
 
/**
 * Row — list row for use inside a divided Card.
 * Adds a bottom border automatically; last-child rule handled via CSS class.
 * `plain` removes the border (manual Sep handles grouping instead).
 */
export function Row({
  children,
  plain = false,
  onClick,
}: {
  children: ReactNode;
  plain?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        borderBottom: plain ? "none" : `0.5px solid ${tokens.border}`,
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = tokens.bg3)}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      {children}
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────
//  ATOMS
// ─────────────────────────────────────────────────────────────
 
/** Coloured square badge — asset initials, L/S trade side */
export function Badge({
  children,
  bg,
  color,
}: {
  children: ReactNode;
  bg: string;
  color: string;
}) {
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: bg,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 500,
        flexShrink: 0,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </div>
  );
}
 
const PILL_STYLES: Record<PillVariant, { background: string; color: string }> = {
  green: { background: "rgba(74,222,128,0.10)",  color: "#4ade80" },
  red:   { background: "rgba(248,113,113,0.10)", color: "#f87171" },
  blue:  { background: "rgba(116,143,252,0.12)", color: "#748ffc" },
  muted: { background: "#1c1f2e",                color: "#5a5e78" },
};
 
/** Inline status pill */
export function Pill({
  children,
  variant = "muted",
}: {
  children: ReactNode;
  variant?: PillVariant;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 10,
        fontWeight: 500,
        padding: "3px 9px",
        borderRadius: 20,
        letterSpacing: "0.2px",
        ...PILL_STYLES[variant],
      }}
    >
      {children}
    </span>
  );
}
 
/** Ghost or primary button */
export function Btn({
  children,
  primary = false,
  onClick,
}: {
  children: ReactNode;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        padding: "7px 14px",
        borderRadius: 9,
        border: `0.5px solid ${primary ? tokens.accent : tokens.border}`,
        background: primary ? tokens.accent : tokens.bg2,
        color: primary ? "#fff" : tokens.text2,
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}
 
// ─────────────────────────────────────────────────────────────
//  DATA COMPONENTS
// ─────────────────────────────────────────────────────────────
 
/** Single labelled bar row — indicators, instrument mix etc. */
export function BarRow({
  label,
  value,
  max = 100,
  color = tokens.accent,
  count,
}: {
  label: string;
  value: number;
  max?: number;
  color?: string;
  count?: number;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 11, color: tokens.text2, width: 48, flexShrink: 0 }}>
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 4,
          background: tokens.border,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: color }}
        />
      </div>
      {count !== undefined && (
        <span style={{ fontSize: 11, color: tokens.text3, width: 24, textAlign: "right", flexShrink: 0 }}>
          {count}
        </span>
      )}
    </div>
  );
}
 
/**
 * DataTable — typed, styled table for use inside a divided Card.
 * Pass column config once; rows are just plain data objects.
 */
export function DataTable<T extends object>({
  columns,
  rows,
}: {
  columns: Column<T>[];
  rows: T[];
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={String(c.key)}
              style={{
                textAlign: "left",
                padding: "9px 16px",
                fontSize: 10,
                fontWeight: 500,
                color: tokens.text3,
                letterSpacing: "0.4px",
                textTransform: "uppercase",
                borderBottom: `0.5px solid ${tokens.border}`,
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            onMouseEnter={(e) =>
              e.currentTarget.querySelectorAll("td").forEach(
                (td) => ((td as HTMLElement).style.background = tokens.bg3)
              )
            }
            onMouseLeave={(e) =>
              e.currentTarget.querySelectorAll("td").forEach(
                (td) => ((td as HTMLElement).style.background = "transparent")
              )
            }
          >
            {columns.map((c) => (
              <td
                key={String(c.key)}
                className={c.className}
                style={{
                  padding: "10px 16px",
                  fontSize: 12,
                  color: tokens.text2,
                  borderBottom: i < rows.length - 1 ? `0.5px solid ${tokens.border}` : "none",
                  transition: "background 0.1s",
                }}
              >
                {c.render ? c.render(row[c.key], row) : String(row[c.key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

{/*}
function JournalCalendar({ portfolio }: { portfolio: Portfolio | null }) {
  const journal = JOURNAL(portfolio);

  const byMonth = journal.reduce((acc, j) => {
    (acc[j.monthKey] ??= []).push(j);
    return acc;
  }, {} as Record<string, ReturnType<typeof JOURNAL>>);

  return (
    <Card title="Journal — recent" action="See all →">
      {Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a)).map(([monthKey, entries]) => {
        const [year, month] = monthKey.split("-").map(Number);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfWeek = new Date(year, month, 1).getDay();
        const monthLabel = new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        const byDay = entries.reduce((acc, j) => {
          (acc[j.day] ??= []).push(j);
          return acc;
        }, {} as Record<number, ReturnType<typeof JOURNAL>>);

        return (
          <div key={monthKey}>
            <div style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, color: tokens.text2, borderBottom: `1px solid ${tokens.border}` }}>
              {monthLabel}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: `1px solid ${tokens.border}` }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} style={{ padding: "4px 8px", fontSize: 10, fontWeight: 600, color: tokens.text3, textAlign: "center", borderBottom: `1px solid ${tokens.border}` }}>
                  {d}
                </div>
              ))}
              {Array(firstDayOfWeek).fill(null).map((_, i) => (
                <div key={`empty-${i}`} style={{ borderRight: `1px solid ${tokens.border}`, borderBottom: `1px solid ${tokens.border}`, minHeight: 80, background: tokens.surface1 }} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
                <div key={day} style={{ borderRight: `1px solid ${tokens.border}`, borderBottom: `1px solid ${tokens.border}`, padding: 6, minHeight: 80 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: tokens.text3, marginBottom: 4 }}>{day}</div>
                  {(byDay[day] ?? []).map((j) => (
                    <div key={j.id} style={{ fontSize: 10, color: j.up ? tokens.green : tokens.red, marginBottom: 2 }}>
                      {j.symbol} {j.pnl}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Card>
  );
}*/}