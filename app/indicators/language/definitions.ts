import type { FinScriptType } from "./types"

export type ParameterDefinition = {
  name: string
  type: FinScriptType | FinScriptType[]
  optional?: boolean
  namedOnly?: boolean
}

export type FunctionDefinition = {
  kind: "function" | "declaration" | "output"
  parameters: ParameterDefinition[]
  returns: FinScriptType
  description: string
}

export type VariableDefinition = {
  kind: "variable" | "constant"
  type: FinScriptType
  description: string
}

export type LanguageDefinition = FunctionDefinition | VariableDefinition

export const LANGUAGE_DEFINITIONS: Record<string, LanguageDefinition> = {
  open: { kind: "variable", type: "series<number>", description: "Opening price for each bar." },
  high: { kind: "variable", type: "series<number>", description: "Highest price for each bar." },
  low: { kind: "variable", type: "series<number>", description: "Lowest price for each bar." },
  close: { kind: "variable", type: "series<number>", description: "Closing price for each bar." },
  volume: { kind: "variable", type: "series<number>", description: "Volume for each bar." },
  hl2: { kind: "variable", type: "series<number>", description: "The average of high and low." },
  hlc3: { kind: "variable", type: "series<number>", description: "The average of high, low, and close." },
  ohlc4: { kind: "variable", type: "series<number>", description: "The average of open, high, low, and close." },
  hlcc4: { kind: "variable", type: "series<number>", description: "The average of high, low, and two close values." },
  "color.blue": { kind: "constant", type: "color", description: "Blue plot colour." },
  "color.orange": { kind: "constant", type: "color", description: "Orange plot colour." },
  "color.green": { kind: "constant", type: "color", description: "Green plot colour." },
  "color.red": { kind: "constant", type: "color", description: "Red plot colour." },
  "color.white": { kind: "constant", type: "color", description: "White plot colour." },
  indicator: {
    kind: "declaration",
    parameters: [
      { name: "title", type: "string" },
      { name: "overlay", type: "boolean", optional: true },
    ],
    returns: "void",
    description: "Declares the script as an indicator.",
  },
  "input.int": {
    kind: "function",
    parameters: [
      { name: "default", type: "number" },
      { name: "title", type: "string", optional: true },
    ],
    returns: "number",
    description: "Creates a whole-number input.",
  },
  "input.float": {
    kind: "function",
    parameters: [
      { name: "default", type: "number" },
      { name: "title", type: "string", optional: true },
    ],
    returns: "number",
    description: "Creates a decimal-number input.",
  },
  "input.bool": {
    kind: "function",
    parameters: [
      { name: "default", type: "boolean" },
      { name: "title", type: "string", optional: true },
    ],
    returns: "boolean",
    description: "Creates a boolean input.",
  },
  "ta.sma": {
    kind: "function",
    parameters: [
      { name: "source", type: "series<number>" },
      { name: "length", type: "number" },
    ],
    returns: "series<number>",
    description: "Simple moving average.",
  },
  "ta.ema": {
    kind: "function",
    parameters: [
      { name: "source", type: "series<number>" },
      { name: "length", type: "number" },
    ],
    returns: "series<number>",
    description: "Exponential moving average.",
  },
  "ta.atr": {
    kind: "function",
    parameters: [{ name: "length", type: "number" }],
    returns: "series<number>",
    description: "Average true range.",
  },
  "ta.rsi": {
    kind: "function",
    parameters: [
      { name: "source", type: "series<number>" },
      { name: "length", type: "number" },
    ],
    returns: "series<number>",
    description: "Relative strength index.",
  },
  plot: {
    kind: "output",
    parameters: [
      { name: "series", type: ["series<number>", "number"] },
      { name: "title", type: "string", optional: true },
      { name: "color", type: ["color", "string"], optional: true },
      { name: "linewidth", type: "number", optional: true },
    ],
    returns: "void",
    description: "Plots a numerical series on the chart.",
  },
}

export const FINSCRIPT_KEYWORDS = ["true", "false", "and", "or", "not"]

