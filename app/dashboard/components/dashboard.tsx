// components/ui/dashboard.tsx
// ─────────────────────────────────────────────────────────────
//  Hyjacked — Dashboard UI primitives
//  All styling lives here. Pages just import and fill data in.
// ─────────────────────────────────────────────────────────────

"use client";

import {
  buttonStyle,
  cornerStyle,
  ghostButtonStyle,
  panelStyle,
  theme,
} from "@/app/ui";
import { ReactNode } from "react";
 
// ── Tokens ───────────────────────────────────────────────────
export const tokens = {
  bg0:      theme.dark.bg,
  bg1:      theme.dark.surface,
  bg2:      theme.dark.surface2,
  bg3:      theme.dark.surface3,
  border:   theme.dark.borderSoft,
  borderHi: theme.dark.border,
  text0:    theme.dark.text,
  text1:    theme.dark.muted,
  text2:    theme.dark.muted,
  text3:    theme.dark.muted2,
  green:    theme.dark.successText,
  greenDim: theme.dark.success,
  red:      theme.dark.errorText,
  redDim:   theme.dark.errorBg,
  blue:     theme.dark.accent,
  blueDim:  theme.dark.accentSoft,
  accent:   theme.dark.accent,
  hover:    "rgba(238,242,247,0.055)",
  hoverStrong: "rgba(238,242,247,0.12)",
  hoverBorder: "rgba(238,242,247,0.28)",
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
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: 24, lineHeight: 1.1, fontWeight: 650, color: tokens.text0 }}>{title}</div>
        {subtitle && (
          <div style={{ fontFamily: "var(--font-code), monospace", fontSize: 11, color: tokens.text3, marginTop: 6 }}>{subtitle}</div>
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
    <div style={{ ...panelStyle(theme.dark), overflow: "hidden" }}>
      <div aria-hidden="true" style={cornerStyle()} />
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px 12px", borderBottom: `1px solid ${tokens.border}` }}>
          <span style={{ fontFamily: "var(--font-code), monospace", fontSize: 10, fontWeight: 600, color: tokens.text2, letterSpacing: 0, textTransform: "uppercase" }}>
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
    <hr style={{ border: "none", borderTop: `1px solid ${tokens.border}`, margin: 0 }} />
  );
}
 
/** Footer strip at the bottom of a Card */
export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "9px 16px",
        borderTop: `1px solid ${tokens.border}`,
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
    <div style={{ ...panelStyle(theme.dark), padding: "14px 16px", overflow: "hidden" }}>
      <div aria-hidden="true" style={cornerStyle()} />
      <div
        style={{
          fontFamily: "var(--font-code), monospace",
          fontSize: 10,
          color: tokens.text3,
          letterSpacing: 0,
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
          letterSpacing: 0,
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
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        borderBottom: plain ? "none" : `1px solid ${tokens.border}`,
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = tokens.hover)}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      <div aria-hidden="true" style={{ ...cornerStyle(), opacity: 0.28 }} />
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
        position: "relative",
        width: 30,
        height: 30,
        border: `1px solid ${tokens.border}`,
        borderRadius: 0,
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
      <div aria-hidden="true" style={{ ...cornerStyle(), opacity: 0.42 }} />
      {children}
    </div>
  );
}
 
const PILL_STYLES: Record<PillVariant, { background: string; color: string }> = {
  green: { background: tokens.greenDim, color: tokens.green },
  red:   { background: tokens.redDim,   color: tokens.red },
  blue:  { background: tokens.blueDim,  color: tokens.blue },
  muted: { background: theme.dark.pill, color: tokens.text3 },
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
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        fontSize: 10,
        fontWeight: 500,
        padding: "3px 9px",
        border: `1px solid ${tokens.border}`,
        borderRadius: 0,
        letterSpacing: 0,
        ...PILL_STYLES[variant],
      }}
    >
      <span aria-hidden="true" style={{ ...cornerStyle(), opacity: 0.32 }} />
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
      onMouseEnter={(e) => {
        e.currentTarget.style.background = primary ? theme.dark.text : tokens.hoverStrong;
        e.currentTarget.style.borderColor = tokens.hoverBorder;
        e.currentTarget.style.color = primary ? theme.dark.bg : theme.dark.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = primary ? theme.dark.accent : "transparent";
        e.currentTarget.style.borderColor = primary ? theme.dark.accent : theme.dark.border;
        e.currentTarget.style.color = primary ? theme.dark.btnText : theme.dark.text;
      }}
      style={{
        ...(primary ? buttonStyle(theme.dark) : ghostButtonStyle(theme.dark)),
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        padding: "7px 12px",
        letterSpacing: 0,
        textTransform: "none",
        whiteSpace: "nowrap",
        fontFamily: "inherit",
        overflow: "hidden",
        border: `1px solid ${primary ? theme.dark.accent : theme.dark.border}`,
      }}
    >
      <span aria-hidden="true" style={{ ...cornerStyle(), opacity: 0.36 }} />
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
          background: "rgba(238,242,247,0.08)",
          borderRadius: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{ width: `${pct}%`, height: "100%", borderRadius: 0, background: color }}
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
                letterSpacing: 0,
                textTransform: "uppercase",
                borderBottom: `1px solid ${tokens.border}`,
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
                (td) => ((td as HTMLElement).style.background = tokens.hover)
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
                  borderBottom: i < rows.length - 1 ? `1px solid ${tokens.border}` : "none",
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
