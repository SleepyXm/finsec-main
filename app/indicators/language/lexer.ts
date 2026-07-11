import { diagnostic } from "./diagnostics"
import type { Token, TokenKind } from "./tokens"
import type { FinScriptDiagnostic } from "./types"

export type LexResult = {
  tokens: Token[]
  diagnostics: FinScriptDiagnostic[]
}

export function lexFinScript(source: string): LexResult {
  const tokens: Token[] = []
  const diagnostics: FinScriptDiagnostic[] = []
  let index = 0
  let line = 1
  let column = 1

  const location = (start: number, startLine: number, startColumn: number) => ({
    line: startLine,
    column: startColumn,
    start,
    end: index,
  })

  const add = (
    kind: TokenKind,
    start: number,
    startLine: number,
    startColumn: number,
    value?: Token["value"],
  ) => {
    tokens.push({
      kind,
      lexeme: source.slice(start, index),
      value,
      ...location(start, startLine, startColumn),
    })
  }

  const advance = () => {
    const char = source[index++]
    column += 1
    return char
  }

  const match = (expected: string) => {
    if (source[index] !== expected) return false
    advance()
    return true
  }

  while (index < source.length) {
    const start = index
    const startLine = line
    const startColumn = column
    const char = advance()

    if (char === " " || char === "\t" || char === "\r") continue

    if (char === "\n") {
      add("newline", start, startLine, startColumn)
      line += 1
      column = 1
      continue
    }

    if (char === "/" && source[index] === "/") {
      while (index < source.length && source[index] !== "\n") advance()
      continue
    }

    const single: Partial<Record<string, TokenKind>> = {
      "(": "leftParen",
      ")": "rightParen",
      "[": "leftBracket",
      "]": "rightBracket",
      ",": "comma",
      ".": "dot",
      "+": "plus",
      "-": "minus",
      "*": "star",
      "%": "percent",
    }

    if (single[char]) {
      add(single[char]!, start, startLine, startColumn)
      continue
    }

    if (char === "/") {
      add("slash", start, startLine, startColumn)
      continue
    }

    if (char === "=") {
      add(match("=") ? "equalEqual" : "equal", start, startLine, startColumn)
      continue
    }

    if (char === "!") {
      if (match("=")) add("bangEqual", start, startLine, startColumn)
      else diagnostics.push(diagnostic("LEX001", "Expected '=' after '!'.", location(start, startLine, startColumn)))
      continue
    }

    if (char === "<") {
      add(match("=") ? "lessEqual" : "less", start, startLine, startColumn)
      continue
    }

    if (char === ">") {
      add(match("=") ? "greaterEqual" : "greater", start, startLine, startColumn)
      continue
    }

    if (char === '"' || char === "'") {
      const quote = char
      let value = ""
      let terminated = false
      while (index < source.length) {
        const next = advance()
        if (next === quote) {
          terminated = true
          break
        }
        if (next === "\\" && index < source.length) {
          const escaped = advance()
          value += escaped === "n" ? "\n" : escaped
        } else {
          value += next
        }
      }
      if (!terminated) {
        diagnostics.push(diagnostic("LEX002", "Unterminated string literal.", location(start, startLine, startColumn)))
      }
      add("string", start, startLine, startColumn, value)
      continue
    }

    if (/\d/.test(char)) {
      while (index < source.length && /\d/.test(source[index])) advance()
      if (source[index] === "." && /\d/.test(source[index + 1] ?? "")) {
        advance()
        while (index < source.length && /\d/.test(source[index])) advance()
      }
      add("number", start, startLine, startColumn, Number(source.slice(start, index)))
      continue
    }

    if (/[A-Za-z_]/.test(char)) {
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) advance()
      const lexeme = source.slice(start, index)
      const keywords: Record<string, TokenKind> = {
        true: "true",
        false: "false",
        and: "and",
        or: "or",
        not: "not",
      }
      const kind = keywords[lexeme] ?? "identifier"
      const value = kind === "true" ? true : kind === "false" ? false : lexeme
      add(kind, start, startLine, startColumn, value)
      continue
    }

    diagnostics.push(diagnostic("LEX003", `Unexpected character '${char}'.`, location(start, startLine, startColumn)))
  }

  tokens.push({
    kind: "eof",
    lexeme: "",
    line,
    column,
    start: index,
    end: index,
  })

  return { tokens, diagnostics }
}

