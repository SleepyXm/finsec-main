import { LANGUAGE_DEFINITIONS } from "@/app/indicators/language/definitions"
import type {
  CallExpression,
  Expression,
  FunctionDeclarationStatement,
  IndicatorExecutionRequest,
  IndicatorExecutionResult,
  Statement,
} from "@/app/indicators/language/types"
import type { OHLCVBar } from "@/app/indicators/primitives"
import { executeMathFunction, isMathFunction } from "./builtins/math"
import { executeTaFunction, isTaFunction } from "./builtins/ta"
import { IndicatorCustomization } from "./customization"
import {
  isBooleanSeries,
  isNumericSeries,
  isSeries,
  isTuple,
  type RuntimeValue,
  toBooleanSeries,
  toNumericSeries,
} from "./valueTypes"

type Scope = Map<string, RuntimeValue>

const argument = (call: CallExpression, name: string, index: number) =>
  call.args.find((entry) => entry.name === name)?.value
  ?? call.args.filter((entry) => !entry.name)[index]?.value

const truthy = (value: RuntimeValue) => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) && value !== 0
  if (typeof value === "string") return value.length > 0
  return false
}

const isScalarExpression = (expression: Expression, inputNames: Set<string>): boolean => {
  if (expression.kind === "literal") return true
  if (expression.kind === "identifier") return inputNames.has(expression.name) || expression.name === "na"
  if (expression.kind === "unary") return isScalarExpression(expression.operand, inputNames)
  if (expression.kind === "binary") {
    return isScalarExpression(expression.left, inputNames) && isScalarExpression(expression.right, inputNames)
  }
  return expression.kind === "call" && expression.callee.startsWith("input.")
}

function scalarBinary(operator: string, left: RuntimeValue, right: RuntimeValue): RuntimeValue {
  if (operator === "and") return truthy(left) && truthy(right)
  if (operator === "or") return truthy(left) || truthy(right)
  if (operator === "==") return left === right
  if (operator === "!=") return left !== right
  if (typeof left !== "number" || typeof right !== "number") {
    throw new Error(`Operator '${operator}' requires numerical values.`)
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

export function executeCoreIndicator({ compiled, bars, inputs = {} }: IndicatorExecutionRequest): IndicatorExecutionResult {
  const globals: Scope = new Map()
  const functions = new Map<string, FunctionDeclarationStatement>()
  const frames = new Map<string, Scope>()
  const inputNames = new Set(compiled.inputs.map((input) => input.id))
  const customization = new IndicatorCustomization(bars, compiled.metadata.overlay)
  const deferred: Statement[] = []
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

  for (const statement of compiled.program.statements) {
    if (statement.kind === "function-declaration") functions.set(statement.name, statement)
    if (isDeferredOutput(statement, customization)) deferred.push(statement)
    if (statement.kind === "assignment" && statement.value.kind === "call" && statement.value.callee.startsWith("input.")) {
      const descriptor = compiled.inputs.find((input) => input.id === statement.name)
      globals.set(statement.name, inputs[statement.name] ?? descriptor?.defaultValue ?? Number.NaN)
    }
  }

  const raw = (scope: Scope, name: string) => scope.get(name) ?? globals.get(name)
  const read = (scope: Scope, name: string, index: number): RuntimeValue => {
    const value = raw(scope, name)
    if (value !== undefined) return isSeries(value) ? value[index] ?? Number.NaN : value
    if (sources[name]) return sources[name][index] ?? Number.NaN
    if (name === "bar_index") return index
    if (name === "barstate.first") return index === 0
    if (name === "barstate.confirmed") return true
    if (name === "na") return Number.NaN
    const constant = customization.constant(name)
    if (constant !== undefined) return constant
    throw new Error(`Unknown runtime identifier '${name}'.`)
  }

  const write = (scope: Scope, name: string, value: RuntimeValue, index: number) => {
    if (typeof value === "string" || isTuple(value) || (!isSeries(value) && typeof value === "object")) {
      scope.set(name, value)
      return
    }
    const scalar = isSeries(value) ? value[index] : value
    const existing = scope.get(name)
    if (typeof scalar === "boolean") {
      const values = existing !== undefined && isBooleanSeries(existing) ? existing : []
      values[index] = scalar
      scope.set(name, values)
    } else {
      const values = existing !== undefined && isNumericSeries(existing) ? existing : []
      values[index] = typeof scalar === "number" ? scalar : Number.NaN
      scope.set(name, values)
    }
  }

  const history = (expression: Expression, index: number, scope: Scope): RuntimeValue => {
    if (index < 0) return Number.NaN
    return evaluateAt(expression, index, scope)
  }

  const callArguments = (call: CallExpression) => {
    const definition = LANGUAGE_DEFINITIONS[call.callee]
    if (!definition || !("parameters" in definition)) return call.args.map((entry) => entry.value)
    const positional = call.args.filter((entry) => !entry.name)
    let positionalIndex = 0
    return definition.parameters.map((parameter) => {
      const named = call.args.find((entry) => entry.name === parameter.name)
      return named?.value ?? positional[positionalIndex++]?.value
    })
  }

  const executeFunction = (call: CallExpression, index: number, callerScope: Scope): RuntimeValue => {
    const declaration = functions.get(call.callee)
    if (!declaration) throw new Error(`Unknown user function '${call.callee}'.`)
    let frame = frames.get(call.callee)
    if (!frame) {
      frame = new Map()
      frames.set(call.callee, frame)
    }
    declaration.parameters.forEach((parameter, parameterIndex) => {
      const expression = call.args[parameterIndex]?.value
      write(frame!, parameter, expression ? evaluateAt(expression, index, callerScope) : Number.NaN, index)
    })
    return executeStatements(declaration.body, index, frame)
  }

  const evaluateCallAt = (call: CallExpression, index: number, scope: Scope): RuntimeValue => {
    if (functions.has(call.callee)) return executeFunction(call, index, scope)
    if (call.callee === "indicator") return 0
    if (call.callee.startsWith("input.")) {
      const expression = argument(call, "default", 0)
      return expression ? evaluateAt(expression, index, scope) : Number.NaN
    }
    if (call.callee === "na") {
      const expression = argument(call, "value", 0)
      const value = expression ? evaluateAt(expression, index, scope) : Number.NaN
      return typeof value === "number" && Number.isNaN(value)
    }
    if (call.callee === "nz") {
      const expression = argument(call, "value", 0)
      const replacement = argument(call, "replacement", 1)
      const value = expression ? evaluateAt(expression, index, scope) : Number.NaN
      return typeof value === "number" && Number.isNaN(value)
        ? replacement ? evaluateAt(replacement, index, scope) : 0
        : value
    }
    if (isMathFunction(call.callee)) {
      const args = call.args.map((entry) => evaluateAt(entry.value, index, scope))
      const result = executeMathFunction(call.callee, args, 1)
      return isSeries(result) ? result[0] : result
    }
    if (isTaFunction(call.callee)) {
      const definition = LANGUAGE_DEFINITIONS[call.callee]
      const expressions = callArguments(call)
      const args: RuntimeValue[] = expressions.map((expression, parameterIndex) => {
        if (!expression) return Number.NaN
        const parameter = definition && "parameters" in definition ? definition.parameters[parameterIndex] : undefined
        const expected = parameter ? (Array.isArray(parameter.type) ? parameter.type : [parameter.type]) : []
        const seriesExpected = expected.some((type) => type.startsWith("series"))
          && !isScalarExpression(expression, inputNames)
        return seriesExpected
          ? Array.from({ length: index + 1 }, (_, offset) => evaluateAt(expression, offset, scope)) as number[] | boolean[]
          : evaluateAt(expression, index, scope)
      })
      const result = executeTaFunction(call.callee, args, bars.slice(0, index + 1), index + 1)
      if (isTuple(result)) {
        return { kind: "tuple", values: result.values.map((value) => isSeries(value) ? value[index] : value) }
      }
      return isSeries(result) ? result[index] : result
    }
    throw new Error(`Unsupported Core function '${call.callee}'.`)
  }

  const evaluateAt = (expression: Expression, index: number, scope: Scope): RuntimeValue => {
    switch (expression.kind) {
      case "literal": return expression.value
      case "identifier": return read(scope, expression.name, index)
      case "call": return evaluateCallAt(expression, index, scope)
      case "history": {
        const offset = evaluateAt(expression.offset, index, scope)
        if (typeof offset !== "number") throw new Error("History offsets must be numerical.")
        return history(expression.target, index - Math.max(0, Math.trunc(offset)), scope)
      }
      case "unary": {
        const value = evaluateAt(expression.operand, index, scope)
        if (expression.operator === "not") return !truthy(value)
        if (typeof value !== "number") throw new Error("Unary numeric operators require a number.")
        return expression.operator === "-" ? -value : value
      }
      case "binary": return scalarBinary(
        expression.operator,
        evaluateAt(expression.left, index, scope),
        evaluateAt(expression.right, index, scope),
      )
      case "conditional": return truthy(evaluateAt(expression.condition, index, scope))
        ? evaluateAt(expression.whenTrue, index, scope)
        : evaluateAt(expression.whenFalse, index, scope)
      case "tuple": return { kind: "tuple", values: expression.values.map((value) => evaluateAt(value, index, scope)) }
    }
  }

  const executeStatements = (statements: Statement[], index: number, scope: Scope): RuntimeValue => {
    let result: RuntimeValue = 0
    for (const statement of statements) {
      if (statement.kind === "assignment" || statement.kind === "reassignment") {
        const value = evaluateAt(statement.value, index, scope)
        write(scope, statement.name, value, index)
        result = value
      } else if (statement.kind === "tuple-assignment") {
        const value = evaluateAt(statement.value, index, scope)
        if (!isTuple(value)) throw new Error("Tuple assignment requires a tuple result.")
        statement.names.forEach((name, tupleIndex) => write(scope, name, value.values[tupleIndex] ?? Number.NaN, index))
        result = value
      } else if (statement.kind === "expression") {
        result = evaluateAt(statement.expression, index, scope)
      } else if (statement.kind === "if") {
        const branch = statement.branches.find((entry) => truthy(evaluateAt(entry.condition, index, scope)))
        if (branch) result = executeStatements(branch.body, index, scope)
        else if (statement.elseBody) result = executeStatements(statement.elseBody, index, scope)
      } else if (statement.kind === "function-declaration") {
        continue
      } else {
        throw new Error(`Core statement '${statement.kind}' is not implemented yet.`)
      }
    }
    return result
  }

  for (let index = 0; index < bars.length; index += 1) {
    const statements = compiled.program.statements.filter((statement) =>
      statement.kind !== "function-declaration"
      && !deferred.includes(statement)
      && !(statement.kind === "assignment" && statement.value.kind === "call" && statement.value.callee.startsWith("input."))
      && !(statement.kind === "expression" && statement.expression.kind === "call" && statement.expression.callee === "indicator"))
    executeStatements(statements, index, globals)
  }

  const evaluateComplete = createCompleteEvaluator(globals, sources, bars, customization)
  for (const statement of deferred) {
    if (statement.kind === "assignment") globals.set(statement.name, evaluateComplete(statement.value))
    else if (statement.kind === "expression") evaluateComplete(statement.expression)
  }

  return { metadata: compiled.metadata, ...customization.outputs() }
}

function isDeferredOutput(statement: Statement, customization: IndicatorCustomization) {
  const expression = statement.kind === "assignment"
    ? statement.value
    : statement.kind === "expression"
      ? statement.expression
      : null
  return expression?.kind === "call" && customization.handles(expression.callee)
}

function createCompleteEvaluator(
  variables: Scope,
  sources: Record<string, number[]>,
  bars: OHLCVBar[],
  customization: IndicatorCustomization,
) {
  const length = bars.length

  const binary = (operator: string, left: RuntimeValue, right: RuntimeValue): RuntimeValue => {
    if (!isSeries(left) && !isSeries(right)) return scalarBinary(operator, left, right)
    if (operator === "and" || operator === "or") {
      const a = toBooleanSeries(left, length)
      const b = toBooleanSeries(right, length)
      return a.map((value, index) => operator === "and" ? value && b[index] : value || b[index])
    }
    const a = toNumericSeries(left, length)
    const b = toNumericSeries(right, length)
    if (["==", "!=", "<", "<=", ">", ">="].includes(operator)) {
      return a.map((value, index) => scalarBinary(operator, value, b[index]) as boolean)
    }
    return a.map((value, index) => scalarBinary(operator, value, b[index]) as number)
  }

  const evaluate = (expression: Expression): RuntimeValue => {
    switch (expression.kind) {
      case "literal": return expression.value
      case "identifier": {
        if (expression.name === "na") return Number.NaN
        if (variables.has(expression.name)) return variables.get(expression.name)!
        if (sources[expression.name]) return sources[expression.name]
        if (expression.name === "barstate.first") return bars.map((_, index) => index === 0)
        const constant = customization.constant(expression.name)
        if (constant !== undefined) return constant
        throw new Error(`Unknown completed identifier '${expression.name}'.`)
      }
      case "call": {
        if (customization.handles(expression.callee)) return customization.execute(expression, evaluate)
        if (expression.callee === "na") {
          const valueExpression = argument(expression, "value", 0)
          const value = valueExpression ? evaluate(valueExpression) : Number.NaN
          return isNumericSeries(value) ? value.map(Number.isNaN) : typeof value === "number" && Number.isNaN(value)
        }
        if (expression.callee === "nz") {
          const valueExpression = argument(expression, "value", 0)
          const value = valueExpression ? evaluate(valueExpression) : Number.NaN
          return isNumericSeries(value) ? value.map((entry) => Number.isNaN(entry) ? 0 : entry) : value
        }
        const args = expression.args.map((entry) => evaluate(entry.value))
        if (isMathFunction(expression.callee)) return executeMathFunction(expression.callee, args, length)
        if (isTaFunction(expression.callee)) return executeTaFunction(expression.callee, args, bars, length)
        throw new Error(`Unsupported completed function '${expression.callee}'.`)
      }
      case "history": {
        const value = evaluate(expression.target)
        const offset = evaluate(expression.offset)
        if (typeof offset !== "number") throw new Error("Completed history offsets must be constant numbers.")
        if (isNumericSeries(value)) return value.map((_, index) => index < offset ? Number.NaN : value[index - offset])
        if (isBooleanSeries(value)) return value.map((_, index) => index < offset ? false : value[index - offset])
        return value
      }
      case "unary": {
        const value = evaluate(expression.operand)
        if (expression.operator === "not") {
          return isBooleanSeries(value) ? value.map((entry) => !entry) : !truthy(value)
        }
        return isNumericSeries(value)
          ? value.map((entry) => expression.operator === "-" ? -entry : entry)
          : typeof value === "number" ? expression.operator === "-" ? -value : value : Number.NaN
      }
      case "binary": return binary(expression.operator, evaluate(expression.left), evaluate(expression.right))
      case "conditional": {
        const condition = evaluate(expression.condition)
        if (!isBooleanSeries(condition)) return truthy(condition) ? evaluate(expression.whenTrue) : evaluate(expression.whenFalse)
        const whenTrue = evaluate(expression.whenTrue)
        const whenFalse = evaluate(expression.whenFalse)
        const a = toNumericSeries(whenTrue, length)
        const b = toNumericSeries(whenFalse, length)
        return condition.map((entry, index) => entry ? a[index] : b[index])
      }
      case "tuple": return { kind: "tuple", values: expression.values.map(evaluate) }
    }
  }
  return evaluate
}
