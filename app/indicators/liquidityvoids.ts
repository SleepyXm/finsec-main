import { computeATR, nz } from "./primitives"
import { RawData } from "@/app/types/charts";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VoidDirection = "bull" | "bear"
export type VoidStatus = "active" | "filled"

export type LiquidityVoidZone = {
  startTime: number
  endTime: number | null    // null = still active, projects to right edge
  top: number
  bottom: number
  direction: VoidDirection
  status: VoidStatus
}

export type LiquidityVoidConfig = {
  atrPeriod: number         // default 144 — Pine uses 144 for void threshold
  threshold: number         // default 0.5 — multiplied against ATR as min void size
  mode: "historical" | "present"
  barsBack: number          // only used in present mode, default 360
}

export const LIQUIDITY_VOID_DEFAULTS: LiquidityVoidConfig = {
  atrPeriod: 144,
  threshold: 0.5,
  mode: "historical",
  barsBack: 360,
}

// ── Compute ───────────────────────────────────────────────────────────────────

export function computeLiquidityVoids(
  data: RawData[],
  config: Partial<LiquidityVoidConfig> = {}
): LiquidityVoidZone[] {
  const cfg = { ...LIQUIDITY_VOID_DEFAULTS, ...config }

  // ATR as void size filter — Pine's atr = ta.atr(144) * lqTH
  const atrSeries = computeATR(data, cfg.atrPeriod)
  const atrByIndex: number[] = new Array(data.length).fill(NaN)
  atrSeries.forEach(p => {
    const i = data.findIndex(b => b.time === p.time)
    if (i !== -1) atrByIndex[i] = p.value
  })

  // Present mode — only look at last N bars
  const startIndex = cfg.mode === "present"
    ? Math.max(0, data.length - cfg.barsBack)
    : 0

  const zones: LiquidityVoidZone[] = []

  // Step 1: Detect void candles left to right — Pine's bull/bear conditions
  for (let i = 2; i < data.length; i++) {
    if (i < startIndex) continue

    const b = data[i]
    const b1 = data[i - 1]  // b[1] in Pine
    const b2 = data[i - 2]  // b[2] in Pine
    const atr = nz(atrByIndex[i]) * cfg.threshold

    // Bullish void — Pine: b.l - b.h[2] > atr and b.l > b.h[2] and b.c[1] > b.h[2]
    const bull = (b.low - b2.high) > atr && b.low > b2.high && b1.close > b2.high

    // Bearish void — Pine: b.l[2] - b.h > atr and b.h < b.l[2] and b.c[1] < b.l[2]
    const bear = (b2.low - b.high) > atr && b.high < b2.low && b1.close < b2.low

    if (bull) {
      const prevBull = i >= 3
        ? (data[i - 1].low - data[i - 3].high) > nz(atrByIndex[i - 1]) * cfg.threshold
          && data[i - 1].low > data[i - 3].high
          && data[i - 2].close > data[i - 3].high
        : false

      // Pine splits the void into 13 sub-boxes for gradient rendering
      // We store it as a single zone — renderer handles the gradient
      const top = prevBull ? b1.low : b.low
      const bottom = prevBull ? b1.low : b2.high

      zones.push({
        startTime: b2.time,
        endTime: null,
        top,
        bottom,
        direction: "bull",
        status: "active",
      })
    }

    if (bear) {
      const prevBear = i >= 3
        ? (data[i - 3].low - data[i - 1].high) > nz(atrByIndex[i - 1]) * cfg.threshold
          && data[i - 1].high < data[i - 3].low
          && data[i - 2].close < data[i - 3].low
        : false

      const top = prevBear ? b.high : b2.low
      const bottom = prevBear ? b1.high : b.high

      zones.push({
        startTime: b2.time,
        endTime: null,
        top,
        bottom,
        direction: "bear",
        status: "active",
      })
    }
  }

  // Step 2: Forward pass — check each subsequent bar against active zones
  // Pine's: if b.h > bBX and b.l < tBX → filled
  for (let i = 0; i < data.length; i++) {
    const b = data[i]
    for (const zone of zones) {
      if (zone.status === "filled") continue
      // Zone hasn't started yet
      if (b.time <= zone.startTime) continue
      // Price has crossed through the zone body
      if (b.high > zone.bottom && b.low < zone.top) {
        zone.status = "filled"
        zone.endTime = b.time
      } else {
        // Still active — extend to current bar
        zone.endTime = null
      }
    }
  }

  return zones
}
