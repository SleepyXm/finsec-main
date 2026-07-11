import { LANGUAGE_DEFINITIONS } from "./definitions"
import { diagnostic } from "./diagnostics"
import type {
  CallExpression,
  Expression,
  FinScriptDiagnostic,
  FinScriptProgram,
  FinScriptType,
} from "./types"

export type CheckResult = {
  diagnostics: FinScriptDiagnostic[]
  expressionTypes: WeakMap<Expression, FinScriptType>
}

const compatible = (actual: FinScriptType, expected: FinScriptType | FinScriptType[]) => {
  const options = Array.isArray(expected) ? expected : [expected]
  return actual === "unknown" || options.includes(actual)
}

export function checkFinScript(program: FinScriptProgram): CheckResult {
  const diagnostics: FinScriptDiagnostic[] = []
  const expressionTypes = new WeakMap<Expression, FinScriptType>()
  const variables = new Map<string, FinScriptType>()
  let declarationCount = 0
  let plotCount = 0

  const checkCall = (expression: CallExpression): FinScriptType => {
    const definition = LANGUAGE_DEFINITIONS[expression.callee]
    if (!definition || (definition.kind !== "function" && definition.kind !== "declaration" && definition.kind !== "output")) {
      diagnostics.push(diagnostic("TYPE001", `Unknown function '${expression.callee}'.`, expression))
      return "unknown"
    }

    if (definition.kind === "declaration") declarationCount += 1
    if (definition.kind === "output") plotCount += 1

    const positional = expression.args.filter((arg) => !arg.name)
    const named = new Map(expression.args.filter((arg) => arg.name).map((arg) => [arg.name!, arg]))

    definition.parameters.forEach((parameter, index) => {
      const arg = named.get(parameter.name) ?? positional[index]
      if (!arg) {
        if (!parameter.optional) {
          diagnostics.push(diagnostic("TYPE002", `Missing argument '${parameter.name}' for '${expression.callee}'.`, expression))
        }
        return
      }
      const actual = checkExpression(arg.value)
      if (!compatible(actual, parameter.type)) {
        const expected = Array.isArray(parameter.type) ? parameter.type.join(" or ") : parameter.type
        diagnostics.push(diagnostic(
          "TYPE003",
          `Argument '${parameter.name}' expects ${expected}, received ${actual}.`,
          arg.value,
        ))
      }
    })

    for (const arg of expression.args) {
      if (arg.name && !definition.parameters.some((parameter) => parameter.name === arg.name)) {
        diagnostics.push(diagnostic("TYPE004", `Unknown named argument '${arg.name}' for '${expression.callee}'.`, arg.value))
      }
    }

    return definition.returns
  }

  const checkExpression = (expression: Expression): FinScriptType => {
    let type: FinScriptType = "unknown"
    switch (expression.kind) {
      case "literal":
        type = typeof expression.value === "number"
          ? "number"
          : typeof expression.value === "boolean"
            ? "boolean"
            : "string"
        break
      case "identifier":
        if (variables.has(expression.name)) {
          type = variables.get(expression.name)!
        } else {
          const definition = LANGUAGE_DEFINITIONS[expression.name]
          type = definition && (definition.kind === "variable" || definition.kind === "constant")
            ? definition.type
            : "unknown"
        }
        if (type === "unknown") {
          diagnostics.push(diagnostic("TYPE005", `Unknown identifier '${expression.name}'.`, expression))
        }
        break
      case "call":
        type = checkCall(expression)
        break
      case "history": {
        const target = checkExpression(expression.target)
        if (target !== "series<number>") {
          diagnostics.push(diagnostic("TYPE006", "History access requires a numerical series.", expression.target))
        }
        type = "series<number>"
        break
      }
      case "unary": {
        const operand = checkExpression(expression.operand)
        type = expression.operator === "not" ? "boolean" : operand
        break
      }
      case "binary": {
        const left = checkExpression(expression.left)
        const right = checkExpression(expression.right)
        if (["==", "!=", "<", "<=", ">", ">=", "and", "or"].includes(expression.operator)) {
          type = left === "series<number>" || right === "series<number>" ? "unknown" : "boolean"
        } else {
          type = left === "series<number>" || right === "series<number>" ? "series<number>" : "number"
        }
        break
      }
    }
    expressionTypes.set(expression, type)
    return type
  }

  for (const statement of program.statements) {
    if (statement.kind === "assignment") {
      const valueType = checkExpression(statement.value)
      variables.set(statement.name, valueType)
    } else {
      checkExpression(statement.expression)
    }
  }

  if (declarationCount === 0) {
    diagnostics.push(diagnostic("TYPE007", "The script requires one indicator() declaration.", program.statements[0] ?? {
      line: 1, column: 1, start: 0, end: 0,
    }))
  } else if (declarationCount > 1) {
    diagnostics.push(diagnostic("TYPE008", "The script can contain only one indicator() declaration.", program.statements[0]))
  }

  if (plotCount === 0) {
    diagnostics.push(diagnostic("TYPE009", "The script must produce at least one plot().", program.statements[0] ?? {
      line: 1, column: 1, start: 0, end: 0,
    }))
  }

  return { diagnostics, expressionTypes }
}
