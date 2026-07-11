import type { OHLCVBar } from "@/app/indicators/primitives"
import {
  type RuntimeTuple,
  type RuntimeValue,
  toBooleanSeries,
  toNumericSeries,
  toPeriod,
} from "@/app/indicators/runtime/valueTypes"

const naSeries = (length: number) => new Array<number>(length).fill(Number.NaN)

export function sma(values: number[], period: number) {
  const result = naSeries(values.length)
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index]
    if (index >= period) sum -= values[index - period]
    if (index >= period - 1) result[index] = sum / period
  }
  return result
}

export function ema(values: number[], period: number) {
  const result = naSeries(values.length)
  if (!values.length) return result
  const alpha = 2 / (period + 1)
  let current = values[0]
  for (let index = 0; index < values.length; index += 1) {
    current = index === 0 ? values[index] : values[index] * alpha + current * (1 - alpha)
    if (index >= period - 1) result[index] = current
  }
  return result
}

export function rma(values: number[], period: number) {
  const result = naSeries(values.length)
  if (!values.length) return result
  const alpha = 1 / period
  let current = values[0]
  for (let index = 0; index < values.length; index += 1) {
    current = index === 0 ? values[index] : values[index] * alpha + current * (1 - alpha)
    if (index >= period - 1) result[index] = current
  }
  return result
}

function wma(values: number[], period: number) {
  const result = naSeries(values.length)
  const denominator = period * (period + 1) / 2
  for (let index = period - 1; index < values.length; index += 1) {
    let weighted = 0
    for (let offset = 0; offset < period; offset += 1) {
      weighted += values[index - offset] * (period - offset)
    }
    result[index] = weighted / denominator
  }
  return result
}

function vwma(values: number[], volumes: number[], period: number) {
  const result = naSeries(values.length)
  let weightedSum = 0
  let volumeSum = 0
  for (let index = 0; index < values.length; index += 1) {
    weightedSum += values[index] * volumes[index]
    volumeSum += volumes[index]
    if (index >= period) {
      weightedSum -= values[index - period] * volumes[index - period]
      volumeSum -= volumes[index - period]
    }
    if (index >= period - 1) result[index] = volumeSum === 0 ? Number.NaN : weightedSum / volumeSum
  }
  return result
}

function rolling(values: number[], period: number, operation: (window: number[]) => number) {
  const result = naSeries(values.length)
  for (let index = period - 1; index < values.length; index += 1) {
    result[index] = operation(values.slice(index - period + 1, index + 1))
  }
  return result
}

function sum(values: number[], period: number) {
  return rolling(values, period, (window) => window.reduce((total, value) => total + value, 0))
}

function variance(values: number[], period: number) {
  return rolling(values, period, (window) => {
    const mean = window.reduce((total, value) => total + value, 0) / window.length
    return window.reduce((total, value) => total + (value - mean) ** 2, 0) / window.length
  })
}

function median(values: number[], period: number) {
  return rolling(values, period, (window) => {
    const sorted = [...window].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  })
}

function change(values: number[], period: number) {
  return values.map((value, index) => index < period ? Number.NaN : value - values[index - period])
}

function roc(values: number[], period: number) {
  return values.map((value, index) => {
    if (index < period || values[index - period] === 0) return Number.NaN
    return 100 * (value - values[index - period]) / values[index - period]
  })
}

function cumulative(values: number[]) {
  let total = 0
  return values.map((value) => (total += value))
}

export function trueRange(bars: OHLCVBar[]) {
  return bars.map((bar, index) => {
    if (index === 0) return bar.high - bar.low
    const previousClose = bars[index - 1].close
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose))
  })
}

function atr(bars: OHLCVBar[], period: number) {
  return rma(trueRange(bars), period)
}

function rsi(values: number[], period: number) {
  const gains = new Array(values.length).fill(0)
  const losses = new Array(values.length).fill(0)
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1]
    gains[index] = Math.max(delta, 0)
    losses[index] = Math.max(-delta, 0)
  }
  const averageGain = rma(gains, period)
  const averageLoss = rma(losses, period)
  return values.map((_, index) => {
    if (index < period || Number.isNaN(averageGain[index]) || Number.isNaN(averageLoss[index])) return Number.NaN
    if (averageLoss[index] === 0) return 100
    const relativeStrength = averageGain[index] / averageLoss[index]
    return 100 - 100 / (1 + relativeStrength)
  })
}

function cross(values1: number[], values2: number[], direction: "over" | "under" | "either") {
  return values1.map((value, index) => {
    if (index === 0) return false
    const crossedOver = value > values2[index] && values1[index - 1] <= values2[index - 1]
    const crossedUnder = value < values2[index] && values1[index - 1] >= values2[index - 1]
    return direction === "over" ? crossedOver : direction === "under" ? crossedUnder : crossedOver || crossedUnder
  })
}

function rising(values: number[], period: number) {
  return values.map((value, index) => {
    if (index < period) return false
    for (let offset = 1; offset <= period; offset += 1) {
      if (value <= values[index - offset]) return false
    }
    return true
  })
}

function falling(values: number[], period: number) {
  return values.map((value, index) => {
    if (index < period) return false
    for (let offset = 1; offset <= period; offset += 1) {
      if (value >= values[index - offset]) return false
    }
    return true
  })
}

function barsSince(condition: boolean[]) {
  let last = -1
  return condition.map((value, index) => {
    if (value) last = index
    return last === -1 ? Number.NaN : index - last
  })
}

function stoch(source: number[], highs: number[], lows: number[], period: number) {
  const highest = rolling(highs, period, (window) => Math.max(...window))
  const lowest = rolling(lows, period, (window) => Math.min(...window))
  return source.map((value, index) => {
    const range = highest[index] - lowest[index]
    return Number.isNaN(range) || range === 0 ? Number.NaN : 100 * (value - lowest[index]) / range
  })
}

function cci(source: number[], period: number) {
  const average = sma(source, period)
  return source.map((value, index) => {
    if (index < period - 1) return Number.NaN
    const window = source.slice(index - period + 1, index + 1)
    const deviation = window.reduce((total, entry) => total + Math.abs(entry - average[index]), 0) / period
    return deviation === 0 ? 0 : (value - average[index]) / (0.015 * deviation)
  })
}

function cmo(source: number[], period: number) {
  const gains = new Array(source.length).fill(0)
  const losses = new Array(source.length).fill(0)
  for (let index = 1; index < source.length; index += 1) {
    const delta = source[index] - source[index - 1]
    gains[index] = Math.max(delta, 0)
    losses[index] = Math.max(-delta, 0)
  }
  const gainSum = sum(gains, period)
  const lossSum = sum(losses, period)
  return source.map((_, index) => {
    const denominator = gainSum[index] + lossSum[index]
    return !Number.isFinite(denominator) || denominator === 0
      ? Number.NaN
      : 100 * (gainSum[index] - lossSum[index]) / denominator
  })
}

function mfi(source: number[], volume: number[], period: number) {
  const positive = new Array(source.length).fill(0)
  const negative = new Array(source.length).fill(0)
  for (let index = 1; index < source.length; index += 1) {
    const flow = source[index] * volume[index]
    if (source[index] > source[index - 1]) positive[index] = flow
    else if (source[index] < source[index - 1]) negative[index] = flow
  }
  const positiveSum = sum(positive, period)
  const negativeSum = sum(negative, period)
  return source.map((_, index) => {
    if (!Number.isFinite(positiveSum[index]) || !Number.isFinite(negativeSum[index])) return Number.NaN
    if (negativeSum[index] === 0) return 100
    return 100 - 100 / (1 + positiveSum[index] / negativeSum[index])
  })
}

function wpr(bars: OHLCVBar[], period: number) {
  const highs = rolling(bars.map((bar) => bar.high), period, (window) => Math.max(...window))
  const lows = rolling(bars.map((bar) => bar.low), period, (window) => Math.min(...window))
  return bars.map((bar, index) => {
    const range = highs[index] - lows[index]
    return !Number.isFinite(range) || range === 0 ? Number.NaN : -100 * (highs[index] - bar.close) / range
  })
}

function bollinger(source: number[], period: number, multiplier: number): RuntimeTuple {
  const middle = sma(source, period)
  const deviation = variance(source, period).map(Math.sqrt)
  return {
    kind: "tuple",
    values: [
      middle,
      middle.map((value, index) => value + multiplier * deviation[index]),
      middle.map((value, index) => value - multiplier * deviation[index]),
    ],
  }
}

function macd(source: number[], fast: number, slow: number, signal: number): RuntimeTuple {
  const fastLine = ema(source, fast)
  const slowLine = ema(source, slow)
  const line = source.map((_, index) => fastLine[index] - slowLine[index])
  const signalLine = ema(line.map((value) => Number.isNaN(value) ? 0 : value), signal)
  const histogram = line.map((value, index) => value - signalLine[index])
  return { kind: "tuple", values: [line, signalLine, histogram] }
}

export function isTaFunction(name: string) {
  return name.startsWith("ta.")
}

export function executeTaFunction(
  name: string,
  args: RuntimeValue[],
  bars: OHLCVBar[],
  length: number,
): RuntimeValue {
  const source = (index = 0) => toNumericSeries(args[index], length)
  const period = (index: number) => toPeriod(args[index])
  const volumes = bars.map((bar) => bar.volume ?? 0)

  if (name === "ta.sma") return sma(source(), period(1))
  if (name === "ta.ema") return ema(source(), period(1))
  if (name === "ta.rma") return rma(source(), period(1))
  if (name === "ta.wma") return wma(source(), period(1))
  if (name === "ta.vwma") return vwma(source(), volumes, period(1))
  if (name === "ta.atr") return atr(bars, period(0))
  if (name === "ta.tr") return trueRange(bars)
  if (name === "ta.rsi") return rsi(source(), period(1))
  if (name === "ta.highest") return rolling(source(), period(1), (window) => Math.max(...window))
  if (name === "ta.lowest") return rolling(source(), period(1), (window) => Math.min(...window))
  if (name === "ta.sum") return sum(source(), period(1))
  if (name === "ta.variance") return variance(source(), period(1))
  if (name === "ta.stdev") return variance(source(), period(1)).map(Math.sqrt)
  if (name === "ta.range") return rolling(source(), period(1), (window) => Math.max(...window) - Math.min(...window))
  if (name === "ta.median") return median(source(), period(1))
  if (name === "ta.change" || name === "ta.mom") return change(source(), args[1] == null ? 1 : period(1))
  if (name === "ta.roc") return roc(source(), period(1))
  if (name === "ta.cum") return cumulative(source())
  if (name === "ta.crossover") return cross(source(), source(1), "over")
  if (name === "ta.crossunder") return cross(source(), source(1), "under")
  if (name === "ta.cross") return cross(source(), source(1), "either")
  if (name === "ta.rising") return rising(source(), period(1))
  if (name === "ta.falling") return falling(source(), period(1))
  if (name === "ta.barssince") return barsSince(toBooleanSeries(args[0], length))
  if (name === "ta.stoch") return stoch(source(), source(1), source(2), period(3))
  if (name === "ta.cci") return cci(source(), period(1))
  if (name === "ta.cmo") return cmo(source(), period(1))
  if (name === "ta.mfi") return mfi(source(), volumes, period(1))
  if (name === "ta.wpr") return wpr(bars, period(0))
  if (name === "ta.bb") return bollinger(source(), period(1), Number(args[2]))
  if (name === "ta.macd") return macd(source(), period(1), period(2), period(3))
  throw new Error(`Unsupported technical-analysis function '${name}'.`)
}
