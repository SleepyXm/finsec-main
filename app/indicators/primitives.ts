import type { RawData } from "@/app/types/charts"

export type SeriesPoint = {
  time: number
  value: number
}

// ── Price Sources ─────────────────────────────────────────────────────────────
// Equivalent to Pine's src = close / hl2 / hlc3 / ohlc4 etc
// These are the building blocks everything else references

export const src = {
  close:  (b: RawData) => b.close,
  open:   (b: RawData) => b.open,
  high:   (b: RawData) => b.high,
  low:    (b: RawData) => b.low,
  hl2:    (b: RawData) => (b.high + b.low) / 2,
  hlc3:   (b: RawData) => (b.high + b.low + b.close) / 3,
  ohlc4:  (b: RawData) => (b.open + b.high + b.low + b.close) / 4,
  hlcc4:  (b: RawData) => (b.high + b.low + b.close + b.close) / 4,
}

export type PriceSource = keyof typeof src

// ── Math Primitives ───────────────────────────────────────────────────────────
// Pine's math.* namespace — pure functions, no bar dependency

export const math = {
  highest: (values: number[], period: number): number[] => {
    return values.map((_, i) => {
      if (i < period - 1) return NaN
      return Math.max(...values.slice(i - period + 1, i + 1))
    })
  },

  lowest: (values: number[], period: number): number[] => {
    return values.map((_, i) => {
      if (i < period - 1) return NaN
      return Math.min(...values.slice(i - period + 1, i + 1))
    })
  },

  stdev: (values: number[], period: number): number[] => {
    return values.map((_, i) => {
      if (i < period - 1) return NaN
      const slice = values.slice(i - period + 1, i + 1)
      const mean = slice.reduce((a, b) => a + b, 0) / period
      return Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period)
    })
  },

  avg: (values: number[]): number =>
    values.reduce((a, b) => a + b, 0) / values.length,

  clamp: (val: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, val)),

  rma: (values: number[], period: number): number[] => {
    // Rolling Moving Average — used internally by ATR/RSI
    const result: number[] = new Array(values.length).fill(NaN)
    const alpha = 1 / period
    for (let i = 0; i < values.length; i++) {
      if (isNaN(values[i])) continue
      if (isNaN(result[i - 1])) {
        result[i] = values[i]
      } else {
        result[i] = alpha * values[i] + (1 - alpha) * result[i - 1]
      }
    }
    return result
  },
}

// ── Core Indicators ───────────────────────────────────────────────────────────
// These are primitives — other indicators compose from these

export function computeSMA(
  data: RawData[],
  period: number,
  source: PriceSource = "close"
): SeriesPoint[] {
  const result: SeriesPoint[] = []
  const getValue = src[source]
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) sum += getValue(data[i - j])
    result.push({ time: data[i].time, value: sum / period })
  }
  return result
}

export function computeEMA(
  data: RawData[],
  period: number,
  source: PriceSource = "close"
): SeriesPoint[] {
  const result: SeriesPoint[] = []
  const getValue = src[source]
  const k = 2 / (period + 1)
  let ema = getValue(data[0])
  for (let i = 0; i < data.length; i++) {
    ema = i === 0 ? getValue(data[i]) : getValue(data[i]) * k + ema * (1 - k)
    if (i >= period - 1) result.push({ time: data[i].time, value: ema })
  }
  return result
}

export function computeATR(data: RawData[], period: number): SeriesPoint[] {
  // True Range first
  const tr: number[] = data.map((b, i) => {
    if (i === 0) return b.high - b.low
    const prevClose = data[i - 1].close
    return Math.max(
      b.high - b.low,
      Math.abs(b.high - prevClose),
      Math.abs(b.low - prevClose)
    )
  })
  // ATR = RMA of TR
  const atr = math.rma(tr, period)
  return data
    .map((b, i) => ({ time: b.time, value: atr[i] }))
    .filter(p => !isNaN(p.value))
}

export function computeRSI(
  data: RawData[],
  period: number,
  source: PriceSource = "close"
): SeriesPoint[] {
  const getValue = src[source]
  const gains: number[] = []
  const losses: number[] = []

  for (let i = 1; i < data.length; i++) {
    const delta = getValue(data[i]) - getValue(data[i - 1])
    gains.push(Math.max(delta, 0))
    losses.push(Math.max(-delta, 0))
  }

  const avgGain = math.rma(gains, period)
  const avgLoss = math.rma(losses, period)

  return data.slice(1).map((b, i) => {
    if (isNaN(avgGain[i]) || isNaN(avgLoss[i])) return null
    const rs = avgLoss[i] === 0 ? 100 : avgGain[i] / avgLoss[i]
    return { time: b.time, value: 100 - 100 / (1 + rs) }
  }).filter(Boolean) as SeriesPoint[]
}

export function computeBollingerBands(
  data: RawData[],
  period: number,
  multiplier: number = 2,
  source: PriceSource = "close"
): { upper: SeriesPoint[]; middle: SeriesPoint[]; lower: SeriesPoint[] } {
  const getValue = src[source]
  const values = data.map(getValue)
  const stdevSeries = math.stdev(values, period)
  const upper: SeriesPoint[] = []
  const middle: SeriesPoint[] = []
  const lower: SeriesPoint[] = []

  for (let i = period - 1; i < data.length; i++) {
    const sma = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
    const sd = stdevSeries[i]
    upper.push({ time: data[i].time, value: sma + multiplier * sd })
    middle.push({ time: data[i].time, value: sma })
    lower.push({ time: data[i].time, value: sma - multiplier * sd })
  }

  return { upper, middle, lower }
}

export function computeMACD(
  data: RawData[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
  source: PriceSource = "close"
): { macd: SeriesPoint[]; signal: SeriesPoint[]; histogram: SeriesPoint[] } {
  const fast = computeEMA(data, fastPeriod, source)
  const slow = computeEMA(data, slowPeriod, source)

  // Align — slow has fewer points
  const slowStart = data.length - slow.length
  const macdLine: SeriesPoint[] = slow.map((s, i) => ({
    time: s.time,
    value: fast[i + slowStart - (data.length - fast.length)].value - s.value,
  }))

  // Signal = EMA of MACD line
  const k = 2 / (signalPeriod + 1)
  let sig = macdLine[0].value
  const signal: SeriesPoint[] = []
  const histogram: SeriesPoint[] = []

  macdLine.forEach((p, i) => {
    sig = i === 0 ? p.value : p.value * k + sig * (1 - k)
    if (i >= signalPeriod - 1) {
      signal.push({ time: p.time, value: sig })
      histogram.push({ time: p.time, value: p.value - sig })
    }
  })

  return { macd: macdLine, signal, histogram }
}

// ── Utility ───────────────────────────────────────────────────────────────────
// Pine's ta.crossover / ta.crossunder equivalents

export function crossover(a: number[], b: number[], i: number): boolean {
  return a[i] > b[i] && a[i - 1] <= b[i - 1]
}

export function crossunder(a: number[], b: number[], i: number): boolean {
  return a[i] < b[i] && a[i - 1] >= b[i - 1]
}

export function nz(val: number | null | undefined, fallback = 0): number {
  return val == null || isNaN(val as number) ? fallback : (val as number)
}
