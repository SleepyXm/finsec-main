import type {
  CallExpression,
  Expression,
  IndicatorExecutionRequest,
  IndicatorExecutionResult,
} from "@/app/indicators/language/types"
import { executeMathFunction, isMathFunction } from "./builtins/math"
import { executeTaFunction, isTaFunction } from "./builtins/ta"
import { executeColorFunction, isColorFunction } from "./builtins/color"
import {
  isBooleanSeries,
  isNumericSeries,
  isSeries,
  isTuple,
  isPlotHandle,
  type RuntimeValue,
  toBooleanSeries,
  toNumericSeries,
} from "./valueTypes"

const COLORS: Record<string, string> = {
  "color.blue": "#2962FF",
  "color.orange": "#FF6D00",
  "color.green": "#00C853",
  "color.red": "#FF1744",
  "color.white": "#FFFFFF",
  "color.yellow": "#FFD600",
  "color.purple": "#AA00FF",
  "color.aqua": "#00E5FF",
  "color.gray": "#9E9E9E",
  "location.abovebar": "aboveBar",
  "location.belowbar": "belowBar",
  "location.inbar": "inBar",
  "shape.circle": "circle",
  "shape.square": "square",
  "shape.arrowup": "arrowUp",
  "shape.arrowdown": "arrowDown",
  "shape.labelup": "arrowUp",
  "shape.labeldown": "arrowDown",
  "location.absolute": "absolute",
  "plot.linebreak": "linebreak",
  "display.none": "none",
}

function argument(call: CallExpression, name: string, index: number) {
  return call.args.find((entry) => entry.name === name)?.value
    ?? call.args.filter((entry) => !entry.name)[index]?.value
}

function scalarBinary(operator: string, left: RuntimeValue, right: RuntimeValue): RuntimeValue {
  if (isSeries(left) || isSeries(right) || isTuple(left) || isTuple(right)) {
    throw new Error(`Operator '${operator}' received an unsupported value.`)
  }

  if (operator === "and") return Boolean(left) && Boolean(right)
  if (operator === "or") return Boolean(left) || Boolean(right)
  if (operator === "==") return left === right
  if (operator === "!=") return left !== right

  if (typeof left !== "number" || typeof right !== "number") {
    throw new Error(`Operator '${operator}' requires numerical operands.`)
  }

  if (operator === "+") return left + right
  if (operator === "-") return left - right
  if (operator === "*") return left * right
  if (operator === "/") return left / right
  if (operator === "%") return left % right
  if (operator === "<") return left < right
  if (operator === "<=") return left <= right
  if (operator === ">") return left > right
  if (operator === ">=") return left >= right
  throw new Error(`Unsupported operator '${operator}'.`)
}

export function executeIndicator({ compiled, bars, inputs = {} }: IndicatorExecutionRequest): IndicatorExecutionResult {
  const variables = new Map<string, RuntimeValue>()
  const plots: IndicatorExecutionResult["plots"] = []
  const fills: IndicatorExecutionResult["fills"] = []
  const boxes: IndicatorExecutionResult["boxes"] = []
  const signals: IndicatorExecutionResult["signals"] = []
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
    if (!isSeries(left) && !isSeries(right)) return scalarBinary(operator, left, right)

    if (operator === "and" || operator === "or") {
      const leftSeries = toBooleanSeries(left, length)
      const rightSeries = toBooleanSeries(right, length)
      return leftSeries.map((value, index) => operator === "and"
        ? value && rightSeries[index]
        : value || rightSeries[index])
    }

    if (isBooleanSeries(left) || isBooleanSeries(right)) {
      const leftSeries = toBooleanSeries(left, length)
      const rightSeries = toBooleanSeries(right, length)
      if (operator === "==") return leftSeries.map((value, index) => value === rightSeries[index])
      if (operator === "!=") return leftSeries.map((value, index) => value !== rightSeries[index])
      throw new Error(`Operator '${operator}' does not support boolean series.`)
    }

    const leftSeries = toNumericSeries(left, length)
    const rightSeries = toNumericSeries(right, length)
    if (["==", "!=", "<", "<=", ">", ">="].includes(operator)) {
      return leftSeries.map((value, index) => {
        const other = rightSeries[index]
        if (operator === "==") return value === other
        if (operator === "!=") return value !== other
        if (operator === "<") return value < other
        if (operator === "<=") return value <= other
        if (operator === ">") return value > other
        return value >= other
      })
    }

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

    if (call.callee === "na") {
      const valueExpression = argument(call, "value", 0)
      if (!valueExpression) throw new Error("na requires a value.")
      const value = evaluate(valueExpression)
      if (isNumericSeries(value)) return value.map((entry) => Number.isNaN(entry))
      return typeof value === "number" && Number.isNaN(value)
    }

    if (call.callee === "nz") {
      const valueExpression = argument(call, "value", 0)
      if (!valueExpression) throw new Error("nz requires a value.")
      const replacementExpression = argument(call, "replacement", 1)
      const replacementValue = replacementExpression ? evaluate(replacementExpression) : 0
      const replacement = typeof replacementValue === "number" ? replacementValue : 0
      const value = evaluate(valueExpression)
      if (isNumericSeries(value)) return value.map((entry) => Number.isNaN(entry) ? replacement : entry)
      return typeof value === "number" && Number.isNaN(value) ? replacement : value
    }

    if (call.callee === "plot") {
      const seriesExpression = argument(call, "series", 0)
      if (!seriesExpression) throw new Error("plot requires a series.")
      const titleExpression = argument(call, "title", 1)
      const colorExpression = argument(call, "color", 2)
      const widthExpression = argument(call, "linewidth", 3)
      const styleExpression = argument(call, "style", 4)
      const displayExpression = argument(call, "display", 5)
      const values = toNumericSeries(evaluate(seriesExpression), length)
      const titleValue = titleExpression ? evaluate(titleExpression) : `Plot ${plots.length + 1}`
      const colorValue = colorExpression ? evaluate(colorExpression) : "#2962FF"
      const widthValue = widthExpression ? evaluate(widthExpression) : 2
      const styleValue = styleExpression ? evaluate(styleExpression) : "line"
      const displayValue = displayExpression ? evaluate(displayExpression) : "visible"
      const lineWidth = Math.min(4, Math.max(1, Math.trunc(Number(widthValue)))) as 1 | 2 | 3 | 4
      const plotId = `plot_${plots.length}`

      plots.push({
        id: plotId,
        title: String(titleValue),
        kind: "line",
        paneIndex: compiled.metadata.overlay ? 0 : 1,
        style: {
          color: String(colorValue),
          lineWidth,
          lineBreak: styleValue === "linebreak",
          visible: displayValue !== "none",
        },
        points: values
          .map((value, index) => Number.isFinite(value)
            ? { time: bars[index].time, value }
            : { time: bars[index].time })
          .filter((point) => styleValue === "linebreak" || point.value !== undefined),
      })
      return { kind: "plot-handle", id: plotId }
    }

    if (call.callee === "fill") {
      const firstExpression = argument(call, "plot1", 0)
      const secondExpression = argument(call, "plot2", 1)
      if (!firstExpression || !secondExpression) throw new Error("fill requires two plot handles.")
      const firstHandle = evaluate(firstExpression)
      const secondHandle = evaluate(secondExpression)
      if (!isPlotHandle(firstHandle) || !isPlotHandle(secondHandle)) {
        throw new Error("fill arguments must be values returned by plot().")
      }
      const firstPlot = plots.find((plot) => plot.id === firstHandle.id)
      const secondPlot = plots.find((plot) => plot.id === secondHandle.id)
      if (!firstPlot || !secondPlot) throw new Error("fill could not resolve its plot outputs.")
      const colorExpression = argument(call, "color", 2)
      const color = colorExpression ? String(evaluate(colorExpression)) : "rgba(41, 98, 255, 0.15)"
      const secondValues = new Map(secondPlot.points.map((point) => [point.time, point.value]))
      fills.push({
        id: `fill_${fills.length}`,
        title: `${firstPlot.title} / ${secondPlot.title}`,
        paneIndex: firstPlot.paneIndex,
        points: firstPlot.points.flatMap((point) => {
          const other = secondValues.get(point.time)
          if (point.value === undefined || other === undefined) return []
          return [{
            time: point.time,
            top: Math.max(point.value, other),
            bottom: Math.min(point.value, other),
            color,
          }]
        }),
      })
      return 0
    }

    if (call.callee === "plotshape") {
      const conditionExpression = argument(call, "condition", 0)
      if (!conditionExpression) throw new Error("plotshape requires a condition.")
      const titleExpression = argument(call, "title", 1)
      const colorExpression = argument(call, "color", 2)
      const locationExpression = argument(call, "location", 3)
      const shapeExpression = argument(call, "shape", 4)
      const textExpression = argument(call, "text", 5)
      const condition = evaluate(conditionExpression)
      const title = titleExpression ? String(evaluate(titleExpression)) : `Signal ${signals.length + 1}`
      const color = colorExpression ? String(evaluate(colorExpression)) : "#00C853"
      const positionValue = locationExpression ? String(evaluate(locationExpression)) : "belowBar"
      const shapeValue = shapeExpression ? String(evaluate(shapeExpression)) : "arrowUp"
      const text = textExpression ? String(evaluate(textExpression)) : title
      const position = (["aboveBar", "belowBar", "inBar"].includes(positionValue)
        ? positionValue
        : "belowBar") as "aboveBar" | "belowBar" | "inBar"
      const shape = (["circle", "square", "arrowUp", "arrowDown"].includes(shapeValue)
        ? shapeValue
        : "arrowUp") as "circle" | "square" | "arrowUp" | "arrowDown"

      signals.push({
        id: `signal_${signals.length}`,
        title,
        style: { color, position, shape, text },
        points: isBooleanSeries(condition)
          ? condition.map((visible, index) => ({ time: bars[index].time, visible }))
          : toNumericSeries(condition, length).map((price, index) => ({
              time: bars[index].time,
              visible: Number.isFinite(price),
              price: Number.isFinite(price) ? price : undefined,
            })),
      })
      return 0
    }

    const args = call.args.map((entry) => evaluate(entry.value))
    if (isColorFunction(call.callee)) return executeColorFunction(call.callee, args)
    if (isMathFunction(call.callee)) return executeMathFunction(call.callee, args, length)
    if (isTaFunction(call.callee)) return executeTaFunction(call.callee, args, bars, length)
    throw new Error(`Unsupported runtime function '${call.callee}'.`)
  }

  const evaluate = (expression: Expression): RuntimeValue => {
    switch (expression.kind) {
      case "literal": return expression.value
      case "identifier": {
        if (expression.name === "na") return Number.NaN
        if (variables.has(expression.name)) return variables.get(expression.name)!
        if (sourceValues[expression.name]) return sourceValues[expression.name]
        if (COLORS[expression.name]) return COLORS[expression.name]
        throw new Error(`Unknown runtime identifier '${expression.name}'.`)
      }
      case "call": return evaluateCall(expression)
      case "history": {
        const value = evaluate(expression.target)
        const offsetValue = evaluate(expression.offset)
        if (typeof offsetValue !== "number" || !Number.isFinite(offsetValue)) {
          throw new Error("The vector runtime requires a constant numerical history offset.")
        }
        const offset = Math.max(0, Math.trunc(offsetValue))
        if (isNumericSeries(value)) {
          return value.map((_, index) => index < offset ? Number.NaN : value[index - offset])
        }
        if (isBooleanSeries(value)) {
          return value.map((_, index) => index < offset ? false : value[index - offset])
        }
        throw new Error("History access requires a series.")
      }
      case "unary": {
        const value = evaluate(expression.operand)
        if (expression.operator === "not") {
          if (isBooleanSeries(value)) return value.map((entry) => !entry)
          return !Boolean(value)
        }
        if (isNumericSeries(value)) return value.map((entry) => expression.operator === "-" ? -entry : entry)
        if (typeof value !== "number") throw new Error("Unary numeric operators require a number.")
        return expression.operator === "-" ? -value : value
      }
      case "binary": return evaluateBinary(expression.operator, evaluate(expression.left), evaluate(expression.right))
      case "conditional":
        throw new Error("Conditional expressions require the stateful runtime, which is not implemented yet.")
      case "tuple":
        return { kind: "tuple", values: expression.values.map((value) => evaluate(value)) }
    }
  }

  for (const statement of compiled.program.statements) {
    if (statement.kind === "assignment") {
      const input = compiled.inputs.find((entry) => entry.id === statement.name)
      variables.set(
        statement.name,
        input ? inputs[statement.name] ?? input.defaultValue : evaluate(statement.value),
      )
    } else if (statement.kind === "tuple-assignment") {
      const result = evaluate(statement.value)
      if (!isTuple(result)) throw new Error("Tuple assignment received a non-tuple result.")
      statement.names.forEach((name, index) => variables.set(name, result.values[index]))
    } else if (statement.kind === "expression") {
      evaluate(statement.expression)
    } else {
      throw new Error(`Statement '${statement.kind}' is not implemented by the vector runtime.`)
    }
  }

  return { metadata: compiled.metadata, plots, fills, boxes, signals }
}
