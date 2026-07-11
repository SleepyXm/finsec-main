import type {
  CallExpression,
  Expression,
  IndicatorExecutionRequest,
  IndicatorExecutionResult,
} from "@/app/indicators/language/types"
import { executeMathFunction, isMathFunction } from "./builtins/math"
import { executeTaFunction, isTaFunction } from "./builtins/ta"
import { IndicatorCustomization } from "./customization"
import { executeCoreIndicator } from "./core"
import {
  isBooleanSeries,
  isNumericSeries,
  isSeries,
  isTuple,
  type RuntimeValue,
  toBooleanSeries,
  toNumericSeries,
} from "./valueTypes"

const argument = (call: CallExpression, name: string, index: number) =>
  call.args.find((entry) => entry.name === name)?.value
  ?? call.args.filter((entry) => !entry.name)[index]?.value

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
  if (compiled.program.statements.some((statement) =>
    ["function-declaration", "reassignment", "if", "while", "for"].includes(statement.kind))) {
    return executeCoreIndicator({ compiled, bars, inputs })
  }
  const variables = new Map<string, RuntimeValue>()
  const customization = new IndicatorCustomization(bars, compiled.metadata.overlay)
  const length = bars.length
  const sources: Record<string, number[]> = {
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
      const expression = argument(call, "value", 0)
      if (!expression) throw new Error("na requires a value.")
      const value = evaluate(expression)
      return isNumericSeries(value)
        ? value.map((entry) => Number.isNaN(entry))
        : typeof value === "number" && Number.isNaN(value)
    }
    if (call.callee === "nz") {
      const expression = argument(call, "value", 0)
      if (!expression) throw new Error("nz requires a value.")
      const replacementExpression = argument(call, "replacement", 1)
      const replacementValue = replacementExpression ? evaluate(replacementExpression) : 0
      const replacement = typeof replacementValue === "number" ? replacementValue : 0
      const value = evaluate(expression)
      return isNumericSeries(value)
        ? value.map((entry) => Number.isNaN(entry) ? replacement : entry)
        : typeof value === "number" && Number.isNaN(value) ? replacement : value
    }
    if (customization.handles(call.callee)) return customization.execute(call, evaluate)

    const args = call.args.map((entry) => evaluate(entry.value))
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
        if (sources[expression.name]) return sources[expression.name]
        const constant = customization.constant(expression.name)
        if (constant !== undefined) return constant
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
          return isBooleanSeries(value) ? value.map((entry) => !entry) : !Boolean(value)
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
      variables.set(statement.name, input ? inputs[statement.name] ?? input.defaultValue : evaluate(statement.value))
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

  return { metadata: compiled.metadata, ...customization.outputs() }
}
