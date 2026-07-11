import { diagnostic } from "./diagnostics"
import type { Token, TokenKind } from "./tokens"
import type {
  BinaryExpression,
  CallArgument,
  Expression,
  FinScriptDiagnostic,
  FinScriptProgram,
  SourceLocation,
  Statement,
} from "./types"

export type ParseResult = {
  program: FinScriptProgram
  diagnostics: FinScriptDiagnostic[]
}

export function parseFinScript(tokens: Token[]): ParseResult {
  const diagnostics: FinScriptDiagnostic[] = []
  const statements: Statement[] = []
  let current = 0

  const peek = () => tokens[current]
  const previous = () => tokens[current - 1]
  const isAtEnd = () => peek().kind === "eof"
  const check = (kind: TokenKind) => peek().kind === kind
  const checkNext = (kind: TokenKind) => tokens[current + 1]?.kind === kind
  const advance = () => {
    if (!isAtEnd()) current += 1
    return previous()
  }
  const match = (...kinds: TokenKind[]) => {
    if (!kinds.includes(peek().kind)) return false
    advance()
    return true
  }
  const loc = (start: SourceLocation, end: SourceLocation): SourceLocation => ({
    line: start.line,
    column: start.column,
    start: start.start,
    end: end.end,
  })

  const consume = (kind: TokenKind, message: string) => {
    if (check(kind)) return advance()
    diagnostics.push(diagnostic("PARSE001", message, peek()))
    return null
  }

  const skipNewlines = () => {
    while (match("newline")) { /* intentional */ }
  }

  const parseQualifiedName = () => {
    const first = consume("identifier", "Expected an identifier.")
    if (!first) return null
    let name = String(first.value ?? first.lexeme)
    let end: SourceLocation = first
    while (match("dot")) {
      const part = consume("identifier", "Expected an identifier after '.'.")
      if (!part) break
      name += `.${String(part.value ?? part.lexeme)}`
      end = part
    }
    return { name, location: loc(first, end) }
  }

  const parsePrimary = (): Expression => {
    if (match("number", "string", "true", "false")) {
      const token = previous()
      return { ...token, kind: "literal", value: token.value! }
    }

    if (match("leftParen")) {
      const expression = parseExpression()
      consume("rightParen", "Expected ')' after expression.")
      return expression
    }

    if (check("identifier")) {
      const qualified = parseQualifiedName()
      if (!qualified) return { ...peek(), kind: "literal", value: Number.NaN }

      let expression: Expression = {
        kind: "identifier",
        name: qualified.name,
        ...qualified.location,
      }

      if (match("leftParen")) {
        const args: CallArgument[] = []
        if (!check("rightParen")) {
          do {
            let name: string | undefined
            if (check("identifier") && checkNext("equal")) {
              name = String(advance().value)
              advance()
            }
            args.push({ name, value: parseExpression() })
          } while (match("comma"))
        }
        const close = consume("rightParen", "Expected ')' after function arguments.") ?? previous()
        expression = {
          kind: "call",
          callee: qualified.name,
          args,
          ...loc(qualified.location, close),
        }
      }

      while (match("leftBracket")) {
        const offset = consume("number", "History offsets must be constant numbers.")
        const close = consume("rightBracket", "Expected ']' after history offset.") ?? previous()
        expression = {
          kind: "history",
          target: expression,
          offset: Math.max(0, Math.trunc(Number(offset?.value ?? 0))),
          ...loc(expression, close),
        }
      }

      return expression
    }

    const token = advance()
    diagnostics.push(diagnostic("PARSE002", "Expected an expression.", token))
    return { ...token, kind: "literal", value: Number.NaN }
  }

  const parseUnary = (): Expression => {
    if (match("plus", "minus", "not")) {
      const operator = previous()
      const operand = parseUnary()
      return {
        kind: "unary",
        operator: operator.kind === "plus" ? "+" : operator.kind === "minus" ? "-" : "not",
        operand,
        ...loc(operator, operand),
      }
    }
    return parsePrimary()
  }

  const binary = (
    next: () => Expression,
    kinds: TokenKind[],
    operators: Record<string, BinaryExpression["operator"]>,
  ) => {
    let expression = next()
    while (kinds.includes(peek().kind)) {
      const operator = advance()
      const right = next()
      expression = {
        kind: "binary",
        operator: operators[operator.kind],
        left: expression,
        right,
        ...loc(expression, right),
      }
    }
    return expression
  }

  const parseFactor = () => binary(parseUnary, ["star", "slash", "percent"], {
    star: "*", slash: "/", percent: "%",
  })
  const parseTerm = () => binary(parseFactor, ["plus", "minus"], { plus: "+", minus: "-" })
  const parseComparison = () => binary(parseTerm, ["less", "lessEqual", "greater", "greaterEqual"], {
    less: "<", lessEqual: "<=", greater: ">", greaterEqual: ">=",
  })
  const parseEquality = () => binary(parseComparison, ["equalEqual", "bangEqual"], {
    equalEqual: "==", bangEqual: "!=",
  })
  const parseAnd = () => binary(parseEquality, ["and"], { and: "and" })
  const parseExpression = () => binary(parseAnd, ["or"], { or: "or" })

  const parseStatement = (): Statement => {
    if (check("identifier") && checkNext("equal")) {
      const name = advance()
      advance()
      const value = parseExpression()
      return {
        kind: "assignment",
        name: String(name.value),
        value,
        ...loc(name, value),
      }
    }

    const expression = parseExpression()
    return { ...expression, kind: "expression", expression }
  }

  skipNewlines()
  while (!isAtEnd()) {
    const before = current
    statements.push(parseStatement())
    if (!check("newline") && !isAtEnd()) {
      diagnostics.push(diagnostic("PARSE003", "Expected a new line after the statement.", peek()))
      while (!check("newline") && !isAtEnd()) advance()
    }
    skipNewlines()
    if (current === before) advance()
  }

  return { program: { statements }, diagnostics }
}
