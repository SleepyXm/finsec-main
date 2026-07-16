import { LANGUAGE_DEFINITIONS } from "./definitions"
import { diagnostic } from "./diagnostics"
import { CallExpression, Expression, FinScriptDiagnostic, FinScriptProgram, FinScriptType, FunctionDeclarationStatement, Statement } from "./types";

export type CheckResult = {
  diagnostics: FinScriptDiagnostic[]
  expressionTypes: WeakMap<Expression, FinScriptType>
}

type UserFunction = {
  declaration: FunctionDeclarationStatement
  returns: FinScriptType
  tupleReturns: FinScriptType[]
}

const compatible = (actual: FinScriptType, expected: FinScriptType | FinScriptType[]) => {
  const options = Array.isArray(expected) ? expected : [expected]
  return actual === "unknown" || options.includes("unknown") || options.includes(actual)
}

export function checkFinScript(program: FinScriptProgram): CheckResult {
  const diagnostics: FinScriptDiagnostic[] = []
  const expressionTypes = new WeakMap<Expression, FinScriptType>()
  const globalVariables = new Map<string, FinScriptType>()
  const userFunctions = new Map<string, UserFunction>()
  const capabilities = new Set<string>()
  let declarationCount = 0
  let plotCount = 0

  const capability = (code: string, message: string, location: Expression | Statement) => {
    if (capabilities.has(code)) return
    capabilities.add(code)
    diagnostics.push(diagnostic(code, message, location))
  }

  for (const statement of program.statements) {
    if (statement.kind !== "function-declaration") continue
    const last = statement.body[statement.body.length - 1]
    const tupleLength = last?.kind === "expression" && last.expression.kind === "tuple"
      ? last.expression.values.length
      : 0
    userFunctions.set(statement.name, {
      declaration: statement,
      returns: tupleLength > 0 ? "tuple" : "unknown",
      tupleReturns: new Array(tupleLength).fill("unknown"),
    })
  }

  const methodReturnType = (callee: string, scope: Map<string, FinScriptType>): FinScriptType | null => {
    const parts = callee.split(".")
    if (parts.length !== 2 || scope.get(parts[0]) !== "array<number>") return null
    if (["size", "first", "get", "min", "avg", "indexof"].includes(parts[1])) return "number"
    if (["clear", "push", "unshift"].includes(parts[1])) return "void"
    return null
  }

  const checkCall = (expression: CallExpression, scope: Map<string, FinScriptType>): FinScriptType => {
    const userFunction = userFunctions.get(expression.callee)
    if (userFunction) {
      expression.args.forEach((argument) => checkExpression(argument.value, scope))
      if (expression.args.length !== userFunction.declaration.parameters.length) {
        diagnostics.push(diagnostic(
          "TYPE013",
          `'${expression.callee}' expects ${userFunction.declaration.parameters.length} arguments, received ${expression.args.length}.`,
          expression,
        ))
      }
      return userFunction.returns
    }

    const dynamicMethod = methodReturnType(expression.callee, scope)
    if (dynamicMethod) {
      expression.args.forEach((argument) => checkExpression(argument.value, scope))
      capability("CAP004", "Array execution is parsed but not yet implemented by the browser runtime.", expression)
      return dynamicMethod
    }

    const definition = LANGUAGE_DEFINITIONS[expression.callee]
    if (!definition || !("parameters" in definition)) {
      diagnostics.push(diagnostic("TYPE001", `Unknown function '${expression.callee}'.`, expression))
      return "unknown"
    }

    if (definition.kind === "declaration") declarationCount += 1
    if (expression.callee === "plot") plotCount += 1
    if (expression.callee === "array.float") {
      capability("CAP004", "Array execution is parsed but not yet implemented by the browser runtime.", expression)
    }
    if (expression.callee === "alertcondition") {
      capability("CAP006", "Alert declarations are parsed but no alert runtime has been implemented.", expression)
    }

    const positional = expression.args.filter((argument) => !argument.name)
    const named = new Map(expression.args.filter((argument) => argument.name).map((argument) => [argument.name!, argument]))
    const actualTypes = new Map<string, FinScriptType>()

    definition.parameters.forEach((parameter, index) => {
      const argument = named.get(parameter.name) ?? positional[index]
      if (!argument) {
        if (!parameter.optional) {
          diagnostics.push(diagnostic("TYPE002", `Missing argument '${parameter.name}' for '${expression.callee}'.`, expression))
        }
        return
      }
      const actual = checkExpression(argument.value, scope)
      actualTypes.set(parameter.name, actual)
      if (!compatible(actual, parameter.type)) {
        const expected = Array.isArray(parameter.type) ? parameter.type.join(" or ") : parameter.type
        diagnostics.push(diagnostic(
          "TYPE003",
          `Argument '${parameter.name}' expects ${expected}, received ${actual}.`,
          argument.value,
        ))
      }
    })

    for (const argument of expression.args) {
      if (argument.name && !definition.parameters.some((parameter) => parameter.name === argument.name)) {
        diagnostics.push(diagnostic("TYPE004", `Unknown named argument '${argument.name}' for '${expression.callee}'.`, argument.value))
      }
    }

    if (expression.callee === "na") {
      const valueType = actualTypes.get("value") ?? "unknown"
      return valueType.startsWith("series") ? "series<boolean>" : "boolean"
    }
    if (expression.callee === "nz") return actualTypes.get("value") ?? "unknown"
    if (expression.callee.startsWith("math.")) {
      return [...actualTypes.values()].some((value) => value === "series<number>")
        ? "series<number>"
        : "number"
    }
    return definition.returns
  }

  const checkExpression = (expression: Expression, scope: Map<string, FinScriptType>): FinScriptType => {
    let type: FinScriptType = "unknown"
    switch (expression.kind) {
      case "literal":
        type = expression.literalType === "color"
          ? "color"
          : typeof expression.value === "number"
            ? "number"
            : typeof expression.value === "boolean"
              ? "boolean"
              : "string"
        break
      case "identifier":
        if (expression.name === "na") {
          type = "number"
        } else if (scope.has(expression.name)) {
          type = scope.get(expression.name)!
        } else {
          const definition = LANGUAGE_DEFINITIONS[expression.name]
          type = definition && (definition.kind === "variable" || definition.kind === "constant")
            ? definition.type
            : "unknown"
          if (type === "unknown") {
            diagnostics.push(diagnostic("TYPE005", `Unknown identifier '${expression.name}'.`, expression))
          }
        }
        break
      case "call":
        type = checkCall(expression, scope)
        break
      case "history": {
        const target = checkExpression(expression.target, scope)
        const offset = checkExpression(expression.offset, scope)
        if (!compatible(offset, "number") && !compatible(offset, "series<number>")) {
          diagnostics.push(diagnostic("TYPE006", "History offsets must be numerical.", expression.offset))
        }
        if (expression.offset.kind !== "literal") {
          capability("CAP007", "Dynamic history offsets are parsed but not yet implemented by the browser runtime.", expression)
        }
        type = target === "series<boolean>" || target === "boolean" ? "series<boolean>" : "series<number>"
        break
      }
      case "unary": {
        const operand = checkExpression(expression.operand, scope)
        type = expression.operator === "not"
          ? operand.startsWith("series") ? "series<boolean>" : "boolean"
          : operand
        break
      }
      case "binary": {
        const left = checkExpression(expression.left, scope)
        const right = checkExpression(expression.right, scope)
        if (["==", "!=", "<", "<=", ">", ">=", "and", "or"].includes(expression.operator)) {
          type = left.startsWith("series") || right.startsWith("series") ? "series<boolean>" : "boolean"
        } else {
          type = left === "series<number>" || right === "series<number>" ? "series<number>" : "number"
        }
        break
      }
      case "conditional": {
        checkExpression(expression.condition, scope)
        const whenTrue = checkExpression(expression.whenTrue, scope)
        const whenFalse = checkExpression(expression.whenFalse, scope)
        if (whenTrue === "series<number>" || whenFalse === "series<number>") type = "series<number>"
        else if (whenTrue === "series<boolean>" || whenFalse === "series<boolean>") type = "series<boolean>"
        else type = whenTrue === "unknown" ? whenFalse : whenTrue
        break
      }
      case "tuple":
        expression.values.forEach((value) => checkExpression(value, scope))
        type = "tuple"
        break
    }
    expressionTypes.set(expression, type)
    return type
  }

  const checkStatements = (statements: Statement[], scope: Map<string, FinScriptType>) => {
    for (const statement of statements) {
      switch (statement.kind) {
        case "assignment":
          scope.set(statement.name, checkExpression(statement.value, scope))
          break
        case "reassignment":
          if (!scope.has(statement.name)) {
            diagnostics.push(diagnostic("TYPE012", `Cannot reassign unknown variable '${statement.name}'.`, statement))
          }
          scope.set(statement.name, checkExpression(statement.value, scope))
          break
        case "tuple-assignment": {
          const valueType = checkExpression(statement.value, scope)
          let returns: FinScriptType[] = []
          if (statement.value.kind === "call") {
            const userFunction = userFunctions.get(statement.value.callee)
            const definition = LANGUAGE_DEFINITIONS[statement.value.callee]
            returns = userFunction?.tupleReturns
              ?? (definition && "tupleReturns" in definition ? definition.tupleReturns ?? [] : [])
          }
          if (valueType !== "tuple") {
            diagnostics.push(diagnostic("TYPE010", "Tuple assignment requires a tuple-returning expression.", statement.value))
          }
          if (returns.length > 0 && returns.length !== statement.names.length) {
            diagnostics.push(diagnostic(
              "TYPE011",
              `Expected ${returns.length} tuple variables, received ${statement.names.length}.`,
              statement,
            ))
          }
          statement.names.forEach((name, index) => scope.set(name, returns[index] ?? "unknown"))
          break
        }
        case "expression":
          checkExpression(statement.expression, scope)
          break
        case "function-declaration": {
          const local = new Map(scope)
          statement.parameters.forEach((parameter) => local.set(parameter, "unknown"))
          checkStatements(statement.body, local)
          const finalStatement = statement.body[statement.body.length - 1]
          const functionInfo = userFunctions.get(statement.name)
          if (functionInfo && finalStatement?.kind === "expression") {
            functionInfo.returns = checkExpression(finalStatement.expression, local)
            functionInfo.tupleReturns = finalStatement.expression.kind === "tuple"
              ? finalStatement.expression.values.map((value) => checkExpression(value, local))
              : []
          }
          break
        }
        case "if":
          statement.branches.forEach((branch) => {
            checkExpression(branch.condition, scope)
            checkStatements(branch.body, new Map(scope))
          })
          if (statement.elseBody) checkStatements(statement.elseBody, new Map(scope))
          break
        case "while":
          capability("CAP003", "Control-flow blocks are parsed but not yet implemented by the browser runtime.", statement)
          checkExpression(statement.condition, scope)
          checkStatements(statement.body, new Map(scope))
          break
        case "for": {
          capability("CAP003", "Control-flow blocks are parsed but not yet implemented by the browser runtime.", statement)
          checkExpression(statement.from, scope)
          checkExpression(statement.to, scope)
          const local = new Map(scope)
          local.set(statement.variable, "number")
          checkStatements(statement.body, local)
          break
        }
      }
    }
  }

  checkStatements(program.statements, globalVariables)

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
