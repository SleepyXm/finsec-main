import type { OHLCVBar } from "@/app/indicators/primitives"
import type {
  CallExpression,
  Expression,
  IndicatorExecutionRequest,
  IndicatorExecutionResult,
} from "@/app/indicators/language/types"

type RuntimeScalar = number | boolean | string
type RuntimeValue = RuntimeScalar | number[]

const COLORS: Record<string, string> = {
  "color.blue": "#2962FF",
  "color.orange": "#FF6D00",
  "color.green": "#00C853",
  "color.red": "#FF1744",
  "color.white": "#FFFFFF",
}

function isSeries(value: RuntimeValue): value is number[] {
  return Array.isArray(value)
}

function toSeries(value: RuntimeValue, length: number): number[] {
  if (isSeries(value)) return value
  if (typeof value === "number") return new Array(length).fill(value)
  throw new Error("Expected a numerical value or series.")
}

function periodOf(value: RuntimeValue) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    throw new Error("Indicator lengths must be positive numbers.")
  }
  return Math.max(1, Math.trunc(value))
}

function sma(values: number[], period: number) {
  const result = new Array(values.length).fill(Number.NaN)
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index]
    if (index >= period) sum -= values[index - period]
    if (index >= period - 1) result[index] = sum / period
  }
  return result
}

function ema(values: number[], period: number) {
  const result = new Array(values.length).fill(Number.NaN)
  if (!values.length) return result
  const alpha = 2 / (period + 1)
  let current = values[0]
  for (let index = 0; index < values.length; index += 1) {
    current = index === 0 ? values[index] : values[index] * alpha + current * (1 - alpha)
    if (index >= period - 1) result[index] = current
  }
  return result
}

function rma(values: number[], period: number) {
  const result = new Array(values.length).fill(Number.NaN)
  if (!values.length) return result
  const alpha = 1 / period
  let current = values[0]
  for (let index = 0; index < values.length; index += 1) {
    current = index === 0 ? values[index] : values[index] * alpha + current * (1 - alpha)
    if (index >= period - 1) result[index] = current
  }
  return result
}

function atr(bars: OHLCVBar[], period: number) {
  const trueRange = bars.map((bar, index) => {
    if (index === 0) return bar.high - bar.low
    const previousClose = bars[index - 1].close
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose))
  })
  return rma(trueRange, period)
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

function argument(call: CallExpression, name: string, index: number) {
  return call.args.find((entry) => entry.name === name)?.value ?? call.args.filter((entry) => !entry.name)[index]?.value
}

export function executeIndicator({ compiled, bars, inputs = {} }: IndicatorExecutionRequest): IndicatorExecutionResult {
  const variables = new Map<string, RuntimeValue>()
  const plots: IndicatorExecutionResult["plots"] = []
  const length = bars.length

  const sourceValues: Record<string, number[]> = {
    open: bars.map((bar) => bar.open),
    high: bars.map((bar) => bar.high),
    low: bars.map((bar) => bar.low),
    close: bars.map((bar) => bar.close),
    volume: bars.map((bar) => bar.volume ?? 0),
    hl2: bars.map((bar) => (bar.high + bar.low) / 2),
    hlc3: bars.map((bar) => (bar.high + bar.low + bar.close) / 3),
    ohlc4: bars.map((bar) => (bar.open + bar.high + bar.low + bar.close) / 4),
    hlcc4: bars.map((bar) => (bar.high + bar.low + bar.close * 2) / 4),
  }

  const evaluateBinary = (operator: string, left: RuntimeValue, right: RuntimeValue): RuntimeValue => {
    if (!isSeries(left) && !isSeries(right)) {
      if (typeof left === "number" && typeof right === "number") {
        if (operator === "+") return left + right
        if (operator === "-") return left - right
        if (operator === "*") return left * right
        if (operator === "/") return left / right
        if (operator === "%") return left % right
        if (operator === "==") return left === right
        if (operator === "!=") return left !== right
        if (operator === "<") return left < right
        if (operator === "<=") return left <= right
        if (operator === ">") return left > right
        if (operator === ">=") return left >= right
      }
      if (operator === "and") return Boolean(left) && Boolean(right)
      if (operator === "or") return Boolean(left) || Boolean(right)
      if (operator === "==") return left === right
      if (operator === "!=") return left !== right
      throw new Error(`Unsupported scalar operation '${operator}'.`)
    }

    const leftSeries = toSeries(left, length)
    const rightSeries = toSeries(right, length)
    return leftSeries.map((value, index) => {
      const other = rightSeries[index]
      if (operator === "+") return value + other
      if (operator === "-") return value - other
      if (operator === "*") return value * other
      if (operator === "/") return value / other
      if (operator === "%") return value % other
      return Number.NaN
    })
  }

  const evaluateCall = (call: CallExpression): RuntimeValue => {
    if (call.callee === "indicator") return 0

    if (call.callee.startsWith("input.")) {
      const defaultExpression = argument(call, "default", 0)
      if (!defaultExpression) throw new Error(`${call.callee} requires a default value.`)
      return evaluate(defaultExpression)
    }

    if (call.callee === "ta.sma" || call.callee === "ta.ema" || call.callee === "ta.rsi") {
      const sourceExpression = argument(call, "source", 0)
      const periodExpression = argument(call, "length", 1)
      if (!sourceExpression || !periodExpression) throw new Error(`${call.callee} requires source and length.`)
      const values = toSeries(evaluate(sourceExpression), length)
      const period = periodOf(evaluate(periodExpression))
      if (call.callee === "ta.sma") return sma(values, period)
      if (call.callee === "ta.ema") return ema(values, period)
      return rsi(values, period)
    }

    if (call.callee === "ta.atr") {
      const periodExpression = argument(call, "length", 0)
      if (!periodExpression) throw new Error("ta.atr requires a length.")
      return atr(bars, periodOf(evaluate(periodExpression)))
    }

    if (call.callee === "plot") {
      const seriesExpression = argument(call, "series", 0)
      if (!seriesExpression) throw new Error("plot requires a series.")
      const titleExpression = argument(call, "title", 1)
      const colorExpression = argument(call, "color", 2)
      const widthExpression = argument(call, "linewidth", 3)
      const values = toSeries(evaluate(seriesExpression), length)
      const titleValue = titleExpression ? evaluate(titleExpression) : `Plot ${plots.length + 1}`
      const colorValue = colorExpression ? evaluate(colorExpression) : "#2962FF"
      const widthValue = widthExpression ? evaluate(widthExpression) : 2
      const lineWidth = Math.min(4, Math.max(1, Math.trunc(Number(widthValue)))) as 1 | 2 | 3 | 4

      plots.push({
        id: `plot_${plots.length}`,
        title: String(titleValue),
        kind: "line",
        paneIndex: compiled.metadata.overlay ? 0 : 1,
        style: { color: String(colorValue), lineWidth },
        points: values
          .map((value, index) => ({ time: bars[index].time, value }))
          .filter((point) => Number.isFinite(point.value)),
      })
      return 0
    }

    throw new Error(`Unsupported runtime function '${call.callee}'.`)
  }

  const evaluate = (expression: Expression): RuntimeValue => {
    switch (expression.kind) {
      case "literal": return expression.value
      case "identifier": {
        if (variables.has(expression.name)) return variables.get(expression.name)!
        if (sourceValues[expression.name]) return sourceValues[expression.name]
        if (COLORS[expression.name]) return COLORS[expression.name]
        throw new Error(`Unknown runtime identifier '${expression.name}'.`)
      }
      case "call": return evaluateCall(expression)
      case "history": {
        const values = toSeries(evaluate(expression.target), length)
        return values.map((_, index) => index < expression.offset ? Number.NaN : values[index - expression.offset])
      }
      case "unary": {
        const value = evaluate(expression.operand)
        if (expression.operator === "not") return !Boolean(value)
        if (isSeries(value)) return value.map((entry) => expression.operator === "-" ? -entry : entry)
        if (typeof value !== "number") throw new Error("Unary numeric operators require a number.")
        return expression.operator === "-" ? -value : value
      }
      case "binary": return evaluateBinary(expression.operator, evaluate(expression.left), evaluate(expression.right))
    }
  }

  for (const statement of compiled.program.statements) {
    if (statement.kind === "assignment") {
      const input = compiled.inputs.find((entry) => entry.id === statement.name)
      if (input) {
        variables.set(statement.name, inputs[statement.name] ?? input.defaultValue)
      } else {
        variables.set(statement.name, evaluate(statement.value))
      }
    } else {
      evaluate(statement.expression)
    }
  }

  return { metadata: compiled.metadata, plots }
}

