import type { OHLCVBar } from "@/app/indicators/primitives"

export type FinScriptType =
  | "number"
  | "boolean"
  | "string"
  | "color"
  | "series<number>"
  | "void"
  | "unknown"

export type SourceLocation = {
  line: number
  column: number
  start: number
  end: number
}

export type FinScriptDiagnostic = SourceLocation & {
  severity: "error" | "warning"
  message: string
  code: string
}

export type InputDescriptor = {
  id: string
  title: string
  type: "int" | "float" | "bool"
  defaultValue: number | boolean
}

export type IndicatorMetadata = {
  title: string
  overlay: boolean
}

export type LiteralExpression = SourceLocation & {
  kind: "literal"
  value: string | number | boolean
}

export type IdentifierExpression = SourceLocation & {
  kind: "identifier"
  name: string
}

export type UnaryExpression = SourceLocation & {
  kind: "unary"
  operator: "+" | "-" | "not"
  operand: Expression
}

export type BinaryExpression = SourceLocation & {
  kind: "binary"
  operator: "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "and" | "or"
  left: Expression
  right: Expression
}

export type HistoryExpression = SourceLocation & {
  kind: "history"
  target: Expression
  offset: number
}

export type CallArgument = {
  name?: string
  value: Expression
}

export type CallExpression = SourceLocation & {
  kind: "call"
  callee: string
  args: CallArgument[]
}

export type Expression =
  | LiteralExpression
  | IdentifierExpression
  | UnaryExpression
  | BinaryExpression
  | HistoryExpression
  | CallExpression

export type AssignmentStatement = SourceLocation & {
  kind: "assignment"
  name: string
  value: Expression
}

export type ExpressionStatement = SourceLocation & {
  kind: "expression"
  expression: Expression
}

export type Statement = AssignmentStatement | ExpressionStatement

export type FinScriptProgram = {
  statements: Statement[]
}

export type CompiledIndicator = {
  languageVersion: 1
  metadata: IndicatorMetadata
  inputs: InputDescriptor[]
  program: FinScriptProgram
}

export type AppliedIndicator = {
  id: string
  source: string
  compiled: CompiledIndicator
  inputs: Record<string, number | boolean>
  enabled: boolean
}

export type IndicatorPlot = {
  id: string
  title: string
  kind: "line"
  paneIndex: number
  style: {
    color: string
    lineWidth: 1 | 2 | 3 | 4
  }
  points: Array<{ time: number; value: number }>
}

export type IndicatorExecutionResult = {
  metadata: IndicatorMetadata
  plots: IndicatorPlot[]
}

export type IndicatorExecutionRequest = {
  compiled: CompiledIndicator
  bars: OHLCVBar[]
  inputs?: Record<string, number | boolean>
}

