import type { SourceLocation } from "./types"

export type TokenKind =
  | "identifier"
  | "number"
  | "string"
  | "true"
  | "false"
  | "newline"
  | "leftParen"
  | "rightParen"
  | "leftBracket"
  | "rightBracket"
  | "comma"
  | "dot"
  | "equal"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "percent"
  | "equalEqual"
  | "bangEqual"
  | "less"
  | "lessEqual"
  | "greater"
  | "greaterEqual"
  | "and"
  | "or"
  | "not"
  | "eof"

export type Token = SourceLocation & {
  kind: TokenKind
  lexeme: string
  value?: string | number | boolean
}

