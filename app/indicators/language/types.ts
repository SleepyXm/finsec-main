import type { OHLCVBar } from "@/app/indicators/primitives"

export type FinScriptType =
  | "number"
  | "boolean"
  | "string"
  | "color"
  | "series<number>"
  | "series<boolean>"
  | "array<number>"
  | "plot"
  | "tuple"
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
  type: "int" | "float" | "bool" | "color"
  defaultValue: number | boolean | string
}

export type IndicatorMetadata = {
  title: string
  overlay: boolean
}

export type LiteralExpression = SourceLocation & {
  kind: "literal"
  value: string | number | boolean
  literalType?: "color"
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

export type ConditionalExpression = SourceLocation & {
  kind: "conditional"
  condition: Expression
  whenTrue: Expression
  whenFalse: Expression
}

export type HistoryExpression = SourceLocation & {
  kind: "history"
  target: Expression
  offset: Expression
}

export type TupleExpression = SourceLocation & {
  kind: "tuple"
  values: Expression[]
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
  | ConditionalExpression
  | HistoryExpression
  | TupleExpression
  | CallExpression

export type AssignmentStatement = SourceLocation & {
  kind: "assignment"
  name: string
  value: Expression
}

export type ReassignmentStatement = SourceLocation & {
  kind: "reassignment"
  name: string
  value: Expression
}

export type TupleAssignmentStatement = SourceLocation & {
  kind: "tuple-assignment"
  names: string[]
  value: Expression
}

export type ExpressionStatement = SourceLocation & {
  kind: "expression"
  expression: Expression
}

export type FunctionDeclarationStatement = SourceLocation & {
  kind: "function-declaration"
  name: string
  parameters: string[]
  body: Statement[]
}

export type IfStatement = SourceLocation & {
  kind: "if"
  branches: Array<{ condition: Expression; body: Statement[] }>
  elseBody?: Statement[]
}

export type WhileStatement = SourceLocation & {
  kind: "while"
  condition: Expression
  body: Statement[]
}

export type ForStatement = SourceLocation & {
  kind: "for"
  variable: string
  from: Expression
  to: Expression
  body: Statement[]
}

export type Statement =
  | AssignmentStatement
  | ReassignmentStatement
  | TupleAssignmentStatement
  | ExpressionStatement
  | FunctionDeclarationStatement
  | IfStatement
  | WhileStatement
  | ForStatement

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
  inputs: Record<string, number | boolean | string>
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
    lineBreak: boolean
    visible: boolean
  }
  points: Array<{ time: number; value?: number; color?: string }>
}

export type IndicatorFill = {
  id: string
  title: string
  paneIndex: number
  points: Array<{ time: number; top: number; bottom: number; color: string }>
}

export type IndicatorBox = {
  id: string
  paneIndex: number
  leftTime: number
  rightTime?: number
  top: number
  bottom: number
  fillColor: string
  borderColor?: string
  borderWidth: number
  extendRight: boolean
}

export type IndicatorSignal = {
  id: string
  title: string
  style: {
    color: string
    position: "aboveBar" | "belowBar" | "inBar"
    shape: "circle" | "square" | "arrowUp" | "arrowDown"
    text?: string
  }
  points: Array<{ time: number; visible: boolean; price?: number }>
}

export type IndicatorExecutionResult = {
  metadata: IndicatorMetadata
  plots: IndicatorPlot[]
  fills: IndicatorFill[]
  boxes: IndicatorBox[]
  signals: IndicatorSignal[]
}

export type IndicatorExecutionRequest = {
  compiled: CompiledIndicator
  bars: OHLCVBar[]
  inputs?: Record<string, number | boolean | string>
}
