import { diagnostic } from "./diagnostics"
import { Token, TokenKind } from "./tokens";
import { BinaryExpression, CallArgument, Expression, FinScriptDiagnostic, FinScriptProgram, SourceLocation, Statement } from "./types";

export type ParseResult = {
  program: FinScriptProgram
  diagnostics: FinScriptDiagnostic[]
}

export function parseFinScript(tokens: Token[]): ParseResult {
  const diagnostics: FinScriptDiagnostic[] = []
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
    if (match("number", "string", "true", "false", "hexColor")) {
      const token = previous()
      return {
        ...token,
        kind: "literal",
        value: token.value!,
        literalType: token.kind === "hexColor" ? "color" : undefined,
      }
    }

    if (match("leftParen")) {
      const expression = parseExpression()
      consume("rightParen", "Expected ')' after expression.")
      return expression
    }

    if (match("leftBracket")) {
      const start = previous()
      const values: Expression[] = []
      if (!check("rightBracket")) {
        do values.push(parseExpression())
        while (match("comma"))
      }
      const close = consume("rightBracket", "Expected ']' after tuple values.") ?? previous()
      return { kind: "tuple", values, ...loc(start, close) }
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
        const offset = parseExpression()
        const close = consume("rightBracket", "Expected ']' after history offset.") ?? previous()
        expression = { kind: "history", target: expression, offset, ...loc(expression, close) }
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
  const parseOr = () => binary(parseAnd, ["or"], { or: "or" })
  const parseConditional = (): Expression => {
    const condition = parseOr()
    if (!match("question")) return condition
    const whenTrue = parseExpression()
    consume("colon", "Expected ':' in conditional expression.")
    const whenFalse = parseConditional()
    return { kind: "conditional", condition, whenTrue, whenFalse, ...loc(condition, whenFalse) }
  }
  const parseExpression = () => parseConditional()

  const isTupleAssignment = () => {
    if (!check("leftBracket")) return false
    let cursor = current + 1
    let expectName = true
    while (tokens[cursor] && tokens[cursor].kind !== "rightBracket") {
      if (expectName && tokens[cursor].kind !== "identifier") return false
      if (!expectName && tokens[cursor].kind !== "comma") return false
      expectName = !expectName
      cursor += 1
    }
    return tokens[cursor]?.kind === "rightBracket" && tokens[cursor + 1]?.kind === "equal"
  }

  const isFunctionDeclaration = () => {
    if (!check("identifier") || !checkNext("leftParen")) return false
    let cursor = current + 1
    let depth = 0
    while (tokens[cursor] && tokens[cursor].kind !== "newline" && tokens[cursor].kind !== "eof") {
      if (tokens[cursor].kind === "leftParen") depth += 1
      if (tokens[cursor].kind === "rightParen") {
        depth -= 1
        if (depth === 0) return tokens[cursor + 1]?.kind === "arrow"
      }
      cursor += 1
    }
    return false
  }

  const statementEnd = (statements: Statement[], fallback: SourceLocation) =>
    statements.length > 0 ? statements[statements.length - 1] : fallback

  const parseBlock = (): Statement[] => {
    consume("newline", "Expected a new line before the block.")
    skipNewlines()
    if (!consume("indent", "Expected an indented block.")) return []
    const statements: Statement[] = []
    skipNewlines()
    while (!check("dedent") && !isAtEnd()) {
      const before = current
      const statement = parseStatement()
      statements.push(statement)
      const compound = ["function-declaration", "if", "while", "for"].includes(statement.kind)
      if (match("newline")) skipNewlines()
      else if (!compound && !check("dedent") && !isAtEnd()) {
        diagnostics.push(diagnostic("PARSE003", "Expected a new line after the statement.", peek()))
        while (!check("newline") && !check("dedent") && !isAtEnd()) advance()
        skipNewlines()
      }
      if (current === before) advance()
    }
    consume("dedent", "Expected the end of the indented block.")
    return statements
  }

  const parseFunctionDeclaration = (): Statement => {
    const start = consume("identifier", "Expected a function name.")!
    consume("leftParen", "Expected '(' after the function name.")
    const parameters: string[] = []
    if (!check("rightParen")) {
      do {
        const parameter = consume("identifier", "Expected a parameter name.")
        if (parameter) parameters.push(String(parameter.value))
      } while (match("comma"))
    }
    consume("rightParen", "Expected ')' after function parameters.")
    consume("arrow", "Expected '=>' after function parameters.")
    const body = parseBlock()
    return {
      kind: "function-declaration",
      name: String(start.value),
      parameters,
      body,
      ...loc(start, statementEnd(body, start)),
    }
  }

  const parseIf = (): Statement => {
    const start = consume("if", "Expected 'if'.")!
    const branches: Array<{ condition: Expression; body: Statement[] }> = []
    const firstCondition = parseExpression()
    branches.push({ condition: firstCondition, body: parseBlock() })
    let elseBody: Statement[] | undefined

    while (match("else")) {
      if (match("if")) {
        const condition = parseExpression()
        branches.push({ condition, body: parseBlock() })
      } else {
        elseBody = parseBlock()
        break
      }
    }

    const finalBody = elseBody ?? branches[branches.length - 1].body
    return { kind: "if", branches, elseBody, ...loc(start, statementEnd(finalBody, firstCondition)) }
  }

  const parseWhile = (): Statement => {
    const start = consume("while", "Expected 'while'.")!
    const condition = parseExpression()
    const body = parseBlock()
    return { kind: "while", condition, body, ...loc(start, statementEnd(body, condition)) }
  }

  const parseFor = (): Statement => {
    const start = consume("for", "Expected 'for'.")!
    const variable = consume("identifier", "Expected a loop variable.")
    consume("equal", "Expected '=' after the loop variable.")
    const from = parseExpression()
    consume("to", "Expected 'to' in the loop range.")
    const to = parseExpression()
    const body = parseBlock()
    return {
      kind: "for",
      variable: String(variable?.value ?? "item"),
      from,
      to,
      body,
      ...loc(start, statementEnd(body, to)),
    }
  }

  const parseStatement = (): Statement => {
    if (isFunctionDeclaration()) return parseFunctionDeclaration()
    if (check("if")) return parseIf()
    if (check("while")) return parseWhile()
    if (check("for")) return parseFor()

    if (isTupleAssignment()) {
      const start = advance()
      const names: string[] = []
      do {
        const name = consume("identifier", "Expected a variable name in tuple assignment.")
        if (name) names.push(String(name.value))
      } while (match("comma"))
      consume("rightBracket", "Expected ']' after tuple variables.")
      consume("equal", "Expected '=' after tuple variables.")
      const value = parseExpression()
      return { kind: "tuple-assignment", names, value, ...loc(start, value) }
    }

    if (check("identifier") && (checkNext("equal") || checkNext("colonEqual"))) {
      const name = advance()
      const reassignment = match("colonEqual")
      if (!reassignment) consume("equal", "Expected '=' after the variable name.")
      const value = parseExpression()
      return {
        kind: reassignment ? "reassignment" : "assignment",
        name: String(name.value),
        value,
        ...loc(name, value),
      }
    }

    const expression = parseExpression()
    return { ...expression, kind: "expression", expression }
  }

  const statements: Statement[] = []
  skipNewlines()
  while (!isAtEnd()) {
    if (match("dedent")) continue
    const before = current
    const statement = parseStatement()
    statements.push(statement)
    const compound = ["function-declaration", "if", "while", "for"].includes(statement.kind)
    if (match("newline")) skipNewlines()
    else if (!compound && !isAtEnd()) {
      diagnostics.push(diagnostic("PARSE003", "Expected a new line after the statement.", peek()))
      while (!check("newline") && !isAtEnd()) advance()
      skipNewlines()
    }
    if (current === before) advance()
  }

  return { program: { statements }, diagnostics }
}
