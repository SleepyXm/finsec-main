
import { SeriesPoint, computeATR, math, nz, crossover, crossunder } from "./primitives"
import type { RawData } from "@/app/types/charts"

// ── Types ─────────────────────────────────────────────────────────────────────

export type SuperTrendPoint = {
  time: number
  value: number
  direction: 1 | -1        // 1 = bearish (above price), -1 = bullish (below price)
  cluster: 0 | 1 | 2       // 0 = high vol, 1 = medium vol, 2 = low vol
  upper: number
  lower: number
}

export type KMeansResult = {
  centroids: [number, number, number]   // [high, medium, low]
  sizes: [number, number, number]
}

export type SuperTrendConfig = {
  atrPeriod: number         // default 10
  factor: number            // default 3
  trainingPeriod: number    // default 100
  highVolPercentile: number // default 0.75
  midVolPercentile: number  // default 0.5
  lowVolPercentile: number  // default 0.25
}

export const SUPERTREND_DEFAULTS: SuperTrendConfig = {
  atrPeriod: 10,
  factor: 3,
  trainingPeriod: 100,
  highVolPercentile: 0.75,
  midVolPercentile: 0.5,
  lowVolPercentile: 0.25,
}

// ── K-Means ───────────────────────────────────────────────────────────────────
// Clusters ATR values into 3 volatility regimes
// Direct port of the Pine while-loop convergence

export function computeKMeans(
  atrValues: number[],
  period: number,
  highPct: number,
  midPct: number,
  lowPct: number
): KMeansResult {
  const slice = atrValues.slice(-period).filter(v => !isNaN(v))
  if (slice.length === 0) {
    return { centroids: [0, 0, 0], sizes: [0, 0, 0] }
  }

  const upper = Math.max(...slice)
  const lower = Math.min(...slice)
  const range = upper - lower

  // Initial centroid guesses from percentiles — Pine's highvol/midvol/lowvol
  let aMean = lower + range * highPct
  let bMean = lower + range * midPct
  let cMean = lower + range * lowPct

  let prevA = NaN
  let prevB = NaN
  let prevC = NaN

  let hv: number[] = []
  let mv: number[] = []
  let lv: number[] = []

  // Converge until centroids stop moving — Pine's while loop
  while (aMean !== prevA || bMean !== prevB || cMean !== prevC) {
    prevA = aMean
    prevB = bMean
    prevC = cMean

    hv = []
    mv = []
    lv = []

    for (const v of slice) {
      const dA = Math.abs(v - aMean)
      const dB = Math.abs(v - bMean)
      const dC = Math.abs(v - cMean)

      if (dA < dB && dA < dC)      hv.push(v)
      else if (dB < dA && dB < dC) mv.push(v)
      else                          lv.push(v)
    }

    if (hv.length) aMean = math.avg(hv)
    if (mv.length) bMean = math.avg(mv)
    if (lv.length) cMean = math.avg(lv)
  }

  return {
    centroids: [aMean, bMean, cMean],
    sizes: [hv.length, mv.length, lv.length],
  }
}

// ── SuperTrend ────────────────────────────────────────────────────────────────
// Stateful sequential pass — must run bar by bar left to right

export function computeSuperTrend(
  data: RawData[],
  config: Partial<SuperTrendConfig> = {}
): SuperTrendPoint[] {
  const cfg = { ...SUPERTREND_DEFAULTS, ...config }
  const { atrPeriod, factor, trainingPeriod, highVolPercentile, midVolPercentile, lowVolPercentile } = cfg

  // Step 1: compute ATR series over full dataset
  const atrSeries = computeATR(data, atrPeriod)

  // Align ATR back to bar indices — ATR starts at bar 0 but has NaN prefix
  const atrByIndex: number[] = new Array(data.length).fill(NaN)
  atrSeries.forEach(p => {
    const i = data.findIndex(b => b.time === p.time)
    if (i !== -1) atrByIndex[i] = p.value
  })

  const result: SuperTrendPoint[] = []

  // Carry forward SuperTrend state bar by bar
  let prevUpper = NaN
  let prevLower = NaN
  let prevSuperTrend = NaN
  let prevDirection: 1 | -1 = 1

  for (let i = 0; i < data.length; i++) {
    const bar = data[i]
    const atr = atrByIndex[i]

    if (isNaN(atr) || i < trainingPeriod - 1) continue

    // Step 2: K-Means over training window ending at current bar
    const atrWindow = atrByIndex.slice(0, i + 1)
    const kmeans = computeKMeans(
      atrWindow,
      trainingPeriod,
      highVolPercentile,
      midVolPercentile,
      lowVolPercentile
    )

    // Step 3: Assign current bar to nearest centroid
    const [hv, mv, lv] = kmeans.centroids
    const dists = [
      Math.abs(atr - hv),
      Math.abs(atr - mv),
      Math.abs(atr - lv),
    ]
    const cluster = dists.indexOf(Math.min(...dists)) as 0 | 1 | 2
    const assignedATR = kmeans.centroids[cluster]

    // Step 4: pine_supertrend() — stateful band calculation
    const hl2 = (bar.high + bar.low) / 2
    let upper = hl2 + factor * assignedATR
    let lower = hl2 - factor * assignedATR

    // Band floors/ceilings — Pine's lowerBand/upperBand carry-forward logic
    lower = lower > nz(prevLower) || data[i - 1]?.close < nz(prevLower)
      ? lower : nz(prevLower)

    upper = upper < nz(prevUpper) || data[i - 1]?.close > nz(prevUpper)
      ? upper : nz(prevUpper)

    // Step 5: Direction
    let direction: 1 | -1
    if (isNaN(atrByIndex[i - 1])) {
      direction = 1
    } else if (prevSuperTrend === prevUpper) {
      direction = bar.close > upper ? -1 : 1
    } else {
      direction = bar.close < lower ? 1 : -1
    }

    const superTrend = direction === -1 ? lower : upper

    result.push({
      time: bar.time,
      value: superTrend,
      direction,
      cluster,
      upper,
      lower,
    })

    prevUpper = upper
    prevLower = lower
    prevSuperTrend = superTrend
    prevDirection = direction
  }

  return result
}

// ── Signals ───────────────────────────────────────────────────────────────────
// Crossover events — Pine's plotshape conditions

export type SuperTrendSignal = {
  time: number
  price: number
  type: "bullish" | "bearish"
  cluster: 0 | 1 | 2
}

export function extractSignals(points: SuperTrendPoint[]): SuperTrendSignal[] {
  const signals: SuperTrendSignal[] = []
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    // Direction flip — Pine's ta.crossunder(dir, 0) / ta.crossover(dir, 0)
    if (prev.direction === 1 && curr.direction === -1) {
      signals.push({ time: curr.time, price: curr.value, type: "bullish", cluster: curr.cluster })
    }
    if (prev.direction === -1 && curr.direction === 1) {
      signals.push({ time: curr.time, price: curr.value, type: "bearish", cluster: curr.cluster })
    }
  }
  return signals
}
