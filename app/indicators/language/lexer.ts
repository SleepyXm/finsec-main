import { diagnostic } from "./diagnostics"
import { Token, TokenKind } from "./tokens";
import { FinScriptDiagnostic } from "./types";

export type LexResult = {
  tokens: Token[]
  diagnostics: FinScriptDiagnostic[]
}

export function lexFinScript(source: string): LexResult {
  const tokens: Token[] = []
  const diagnostics: FinScriptDiagnostic[] = []
  const indentStack = [0]
  let index = 0
  let line = 1
  let column = 1
  let delimiterDepth = 0
  let atLineStart = true

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

  const addSynthetic = (kind: "indent" | "dedent", start: number, tokenLine: number, tokenColumn: number) => {
    tokens.push({
      kind,
      lexeme: "",
      line: tokenLine,
      column: tokenColumn,
      start,
      end: start,
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
    if (atLineStart) {
      let indentation = 0
      while (source[index] === " " || source[index] === "\t") {
        indentation += source[index] === "\t" ? 4 : 1
        advance()
      }

      const blankOrComment = source[index] === "\n"
        || source[index] === "\r"
        || (source[index] === "/" && source[index + 1] === "/")

      if (delimiterDepth === 0 && !blankOrComment && index < source.length) {
        const previousIndent = indentStack[indentStack.length - 1]
        if (indentation > previousIndent) {
          indentStack.push(indentation)
          addSynthetic("indent", index, line, column)
        } else if (indentation < previousIndent) {
          while (indentStack.length > 1 && indentation < indentStack[indentStack.length - 1]) {
            indentStack.pop()
            addSynthetic("dedent", index, line, column)
          }
          if (indentation !== indentStack[indentStack.length - 1]) {
            diagnostics.push(diagnostic(
              "LEX004",
              "Indentation does not match an outer block.",
              { line, column, start: index, end: index },
            ))
          }
        }
      }
      atLineStart = false
    }

    const start = index
    const startLine = line
    const startColumn = column
    const char = advance()

    if (char === " " || char === "\t" || char === "\r") continue

    if (char === "\n") {
      if (delimiterDepth === 0) add("newline", start, startLine, startColumn)
      line += 1
      column = 1
      atLineStart = true
      continue
    }

    if (char === "/" && source[index] === "/") {
      while (index < source.length && source[index] !== "\n") advance()
      continue
    }

    if (char === "#") {
      while (index < source.length && /[0-9A-Fa-f]/.test(source[index])) advance()
      const value = source.slice(start, index)
      if (![4, 5, 7, 9].includes(value.length)) {
        diagnostics.push(diagnostic("LEX005", "Hex colours must use 3, 4, 6, or 8 digits.", location(start, startLine, startColumn)))
      }
      add("hexColor", start, startLine, startColumn, value)
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
      "?": "question",
    }

    if (single[char]) {
      const kind = single[char]!
      if (kind === "leftParen" || kind === "leftBracket") delimiterDepth += 1
      if (kind === "rightParen" || kind === "rightBracket") delimiterDepth = Math.max(0, delimiterDepth - 1)
      add(kind, start, startLine, startColumn)
      continue
    }

    if (char === "/") {
      add("slash", start, startLine, startColumn)
      continue
    }

    if (char === "=") {
      if (match(">")) add("arrow", start, startLine, startColumn)
      else add(match("=") ? "equalEqual" : "equal", start, startLine, startColumn)
      continue
    }

    if (char === ":") {
      add(match("=") ? "colonEqual" : "colon", start, startLine, startColumn)
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
        if: "if",
        else: "else",
        while: "while",
        for: "for",
        to: "to",
      }
      const kind = keywords[lexeme] ?? "identifier"
      const value = kind === "true" ? true : kind === "false" ? false : lexeme
      add(kind, start, startLine, startColumn, value)
      continue
    }

    diagnostics.push(diagnostic("LEX003", `Unexpected character '${char}'.`, location(start, startLine, startColumn)))
  }

  if (tokens.length > 0 && tokens[tokens.length - 1].kind !== "newline") {
    tokens.push({ kind: "newline", lexeme: "", line, column, start: index, end: index })
  }
  while (indentStack.length > 1) {
    indentStack.pop()
    addSynthetic("dedent", index, line, column)
  }
  tokens.push({ kind: "eof", lexeme: "", line, column, start: index, end: index })

  return { tokens, diagnostics }
}
