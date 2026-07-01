// app/indicators/types.ts

import { RawData } from "@/app/types/charts"

// ── Market input ──────────────────────────────────────────────────────────────
// This is the canonical candle shape indicators operate on.

export type Bar = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

// ── Basic plotted output ──────────────────────────────────────────────────────
// Any line-like indicator eventually becomes this.

export type SeriesPoint = {
  time: number
  value: number
}

// ── Source vocabulary ─────────────────────────────────────────────────────────
// These are the source values indicator logic can reference.
// Pine-compatible equivalents:
// close  -> close
// hl2    -> hl2
// hlc3   -> hlc3
// ohlc4  -> ohlc4
// hlcc4  -> hlcc4

export type SourceName =
  | "open"
  | "high"
  | "low"
  | "close"
  | "volume"
  | "hl2"
  | "hlc3"
  | "ohlc4"
  | "hlcc4"

export type SourceGetter = (offset?: number) => number | undefined

export type BarContext = {
  open: SourceGetter
  high: SourceGetter
  low: SourceGetter
  close: SourceGetter
  volume: SourceGetter
  hl2: SourceGetter
  hlc3: SourceGetter
  ohlc4: SourceGetter
  hlcc4: SourceGetter
  time: (offset?: number) => number | undefined

  index: number
  length: number
}

// ── Source helpers ────────────────────────────────────────────────────────────
// Direct single-bar source access.

export const source: Record<SourceName, (bar: Bar) => number> = {
  open: (bar) => bar.open,
  high: (bar) => bar.high,
  low: (bar) => bar.low,
  close: (bar) => bar.close,
  volume: (bar) => bar.volume ?? 0,
  hl2: (bar) => (bar.high + bar.low) / 2,
  hlc3: (bar) => (bar.high + bar.low + bar.close) / 3,
  ohlc4: (bar) => (bar.open + bar.high + bar.low + bar.close) / 4,
  hlcc4: (bar) => (bar.high + bar.low + bar.close + bar.close) / 4,
}

// ── Runtime context ───────────────────────────────────────────────────────────
// offset 0 = current bar
// offset 1 = previous bar
// offset 2 = two bars ago
//
// This is the runtime equivalent of Pine history access:
// close      -> ctx.close(0)
// close[1]   -> ctx.close(1)
// hl2[2]     -> ctx.hl2(2)

export function createBarContext(bars: Bar[], index: number): BarContext {
  const get = (offset = 0) => bars[index - offset]

  return {
    open: (offset = 0) => get(offset)?.open,
    high: (offset = 0) => get(offset)?.high,
    low: (offset = 0) => get(offset)?.low,
    close: (offset = 0) => get(offset)?.close,
    volume: (offset = 0) => get(offset)?.volume ?? 0,
    time: (offset = 0) => get(offset)?.time,

    hl2: (offset = 0) => {
      const bar = get(offset)
      return bar ? (bar.high + bar.low) / 2 : undefined
    },

    hlc3: (offset = 0) => {
      const bar = get(offset)
      return bar ? (bar.high + bar.low + bar.close) / 3 : undefined
    },

    ohlc4: (offset = 0) => {
      const bar = get(offset)
      return bar ? (bar.open + bar.high + bar.low + bar.close) / 4 : undefined
    },

    hlcc4: (offset = 0) => {
      const bar = get(offset)
      return bar ? (bar.high + bar.low + bar.close + bar.close) / 4 : undefined
    },

    index,
    length: bars.length,
  }
}

// ── Normalization ─────────────────────────────────────────────────────────────
// Converts your app chart data into indicator bars.

export function normalizeBars(raw: RawData[]): Bar[] {
  return raw.map((r) => ({
    time: Date.parse(r.time),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }))
}