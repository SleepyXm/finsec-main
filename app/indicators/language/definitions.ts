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
  tupleReturns?: FinScriptType[]
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
  bar_index: { kind: "variable", type: "series<number>", description: "Zero-based bar index." },
  "barstate.first": { kind: "variable", type: "series<boolean>", description: "True on the first available bar." },
  "barstate.confirmed": { kind: "variable", type: "series<boolean>", description: "True when a bar is confirmed." },
  "color.blue": { kind: "constant", type: "color", description: "Blue plot colour." },
  "color.orange": { kind: "constant", type: "color", description: "Orange plot colour." },
  "color.green": { kind: "constant", type: "color", description: "Green plot colour." },
  "color.red": { kind: "constant", type: "color", description: "Red plot colour." },
  "color.white": { kind: "constant", type: "color", description: "White plot colour." },
  "color.yellow": { kind: "constant", type: "color", description: "Yellow plot colour." },
  "color.purple": { kind: "constant", type: "color", description: "Purple plot colour." },
  "color.aqua": { kind: "constant", type: "color", description: "Aqua plot colour." },
  "color.gray": { kind: "constant", type: "color", description: "Gray plot colour." },
  "location.abovebar": { kind: "constant", type: "string", description: "Places a shape above its bar." },
  "location.belowbar": { kind: "constant", type: "string", description: "Places a shape below its bar." },
  "location.inbar": { kind: "constant", type: "string", description: "Places a shape on its bar." },
  "location.absolute": { kind: "constant", type: "string", description: "Places a shape at an absolute price." },
  "shape.circle": { kind: "constant", type: "string", description: "Draws a circular signal marker." },
  "shape.square": { kind: "constant", type: "string", description: "Draws a square signal marker." },
  "shape.arrowup": { kind: "constant", type: "string", description: "Draws an upward arrow signal marker." },
  "shape.arrowdown": { kind: "constant", type: "string", description: "Draws a downward arrow signal marker." },
  "shape.labelup": { kind: "constant", type: "string", description: "Draws an upward signal label." },
  "shape.labeldown": { kind: "constant", type: "string", description: "Draws a downward signal label." },
  "plot.linebreak": { kind: "constant", type: "string", description: "Breaks a plot across unavailable values." },
  "display.none": { kind: "constant", type: "string", description: "Hides an output while keeping its values available." },
  indicator: {
    kind: "declaration",
    parameters: [
      { name: "title", type: "string" },
      { name: "overlay", type: "boolean", optional: true },
    ],
    returns: "void",
    description: "Declares the script as an indicator.",
  },
  na: {
    kind: "function",
    parameters: [{ name: "value", type: "unknown" }],
    returns: "unknown",
    description: "Tests whether a value is unavailable. The identifier na is an unavailable number.",
  },
  nz: {
    kind: "function",
    parameters: [
      { name: "value", type: "unknown" },
      { name: "replacement", type: "unknown", optional: true },
    ],
    returns: "unknown",
    description: "Replaces an unavailable value with zero or another value.",
  },
  "input.int": {
    kind: "function",
    parameters: [
      { name: "default", type: "number" },
      { name: "title", type: "string", optional: true },
      { name: "min", type: "number", optional: true },
      { name: "max", type: "number", optional: true },
      { name: "group", type: "string", optional: true },
      { name: "tooltip", type: "string", optional: true },
    ],
    returns: "number",
    description: "Creates a whole-number input.",
  },
  "input.float": {
    kind: "function",
    parameters: [
      { name: "default", type: "number" },
      { name: "title", type: "string", optional: true },
      { name: "min", type: "number", optional: true },
      { name: "max", type: "number", optional: true },
      { name: "group", type: "string", optional: true },
      { name: "tooltip", type: "string", optional: true },
    ],
    returns: "number",
    description: "Creates a decimal-number input.",
  },
  "input.bool": {
    kind: "function",
    parameters: [
      { name: "default", type: "boolean" },
      { name: "title", type: "string", optional: true },
      { name: "group", type: "string", optional: true },
      { name: "tooltip", type: "string", optional: true },
    ],
    returns: "boolean",
    description: "Creates a boolean input.",
  },
  "input.color": {
    kind: "function",
    parameters: [
      { name: "default", type: ["color", "string"] },
      { name: "title", type: "string", optional: true },
      { name: "group", type: "string", optional: true },
    ],
    returns: "color",
    description: "Creates a colour input.",
  },
  "array.float": {
    kind: "function",
    parameters: [{ name: "initial", type: "unknown", optional: true }],
    returns: "array<number>",
    description: "Creates a floating-point array.",
  },
  "color.fade": {
    kind: "function",
    parameters: [
      { name: "color", type: ["color", "string"] },
      { name: "transparency", type: "number" },
    ],
    returns: "color",
    description: "Applies transparency to a colour.",
  },
  "color.new": {
    kind: "function",
    parameters: [
      { name: "color", type: ["color", "string"] },
      { name: "transparency", type: "number" },
    ],
    returns: "color",
    description: "Creates a colour with the requested transparency.",
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
  "ta.rma": {
    kind: "function",
    parameters: [
      { name: "source", type: "series<number>" },
      { name: "length", type: "number" },
    ],
    returns: "series<number>",
    description: "Wilder's moving average.",
  },
  "ta.wma": {
    kind: "function",
    parameters: [
      { name: "source", type: "series<number>" },
      { name: "length", type: "number" },
    ],
    returns: "series<number>",
    description: "Linearly weighted moving average.",
  },
  "ta.vwma": {
    kind: "function",
    parameters: [
      { name: "source", type: "series<number>" },
      { name: "length", type: "number" },
    ],
    returns: "series<number>",
    description: "Volume-weighted moving average.",
  },
  "ta.highest": rollingDefinition("Highest value in a rolling window."),
  "ta.lowest": rollingDefinition("Lowest value in a rolling window."),
  "ta.sum": rollingDefinition("Sum of values in a rolling window."),
  "ta.stdev": rollingDefinition("Population standard deviation in a rolling window."),
  "ta.variance": rollingDefinition("Population variance in a rolling window."),
  "ta.range": rollingDefinition("Difference between the highest and lowest rolling values."),
  "ta.median": rollingDefinition("Median value in a rolling window."),
  "ta.change": optionalLengthDefinition("Difference from an earlier value."),
  "ta.mom": rollingDefinition("Momentum over the selected number of bars."),
  "ta.roc": rollingDefinition("Percentage rate of change."),
  "ta.cum": {
    kind: "function",
    parameters: [{ name: "source", type: "series<number>" }],
    returns: "series<number>",
    description: "Cumulative sum of a series.",
  },
  "ta.tr": {
    kind: "function",
    parameters: [],
    returns: "series<number>",
    description: "True range.",
  },
  "ta.crossover": signalDefinition("True when the first series crosses above the second."),
  "ta.crossunder": signalDefinition("True when the first series crosses below the second."),
  "ta.cross": signalDefinition("True when either an upward or downward cross occurs."),
  "ta.rising": {
    kind: "function",
    parameters: [
      { name: "source", type: "series<number>" },
      { name: "length", type: "number" },
    ],
    returns: "series<boolean>",
    description: "True when the current value is above all preceding values in the window.",
  },
  "ta.falling": {
    kind: "function",
    parameters: [
      { name: "source", type: "series<number>" },
      { name: "length", type: "number" },
    ],
    returns: "series<boolean>",
    description: "True when the current value is below all preceding values in the window.",
  },
  "ta.barssince": {
    kind: "function",
    parameters: [{ name: "condition", type: "series<boolean>" }],
    returns: "series<number>",
    description: "Number of bars since a condition was true.",
  },
  "ta.stoch": {
    kind: "function",
    parameters: [
      { name: "source", type: "series<number>" },
      { name: "high", type: "series<number>" },
      { name: "low", type: "series<number>" },
      { name: "length", type: "number" },
    ],
    returns: "series<number>",
    description: "Stochastic oscillator.",
  },
  "ta.cci": rollingDefinition("Commodity channel index."),
  "ta.cmo": rollingDefinition("Chande momentum oscillator."),
  "ta.mfi": {
    kind: "function",
    parameters: [
      { name: "source", type: "series<number>" },
      { name: "length", type: "number" },
    ],
    returns: "series<number>",
    description: "Money flow index using chart volume.",
  },
  "ta.wpr": {
    kind: "function",
    parameters: [{ name: "length", type: "number" }],
    returns: "series<number>",
    description: "Williams percent range.",
  },
  "ta.bb": tupleDefinition(
    "Bollinger Bands: middle, upper, and lower series.",
    [
      { name: "source", type: "series<number>" },
      { name: "length", type: "number" },
      { name: "multiplier", type: "number" },
    ],
    ["series<number>", "series<number>", "series<number>"],
  ),
  "ta.macd": tupleDefinition(
    "MACD line, signal line, and histogram.",
    [
      { name: "source", type: "series<number>" },
      { name: "fastLength", type: "number" },
      { name: "slowLength", type: "number" },
      { name: "signalLength", type: "number" },
    ],
    ["series<number>", "series<number>", "series<number>"],
  ),
  plot: {
    kind: "output",
    parameters: [
      { name: "series", type: ["series<number>", "number"] },
      { name: "title", type: "string", optional: true },
      { name: "color", type: ["color", "string"], optional: true },
      { name: "linewidth", type: "number", optional: true },
      { name: "style", type: "string", optional: true },
      { name: "display", type: "string", optional: true },
    ],
    returns: "plot",
    description: "Plots a numerical series on the chart.",
  },
  plotshape: {
    kind: "output",
    parameters: [
      { name: "condition", type: ["series<boolean>", "boolean", "series<number>", "number"] },
      { name: "title", type: "string", optional: true },
      { name: "color", type: ["color", "string"], optional: true },
      { name: "location", type: "string", optional: true },
      { name: "shape", type: "string", optional: true },
      { name: "text", type: "string", optional: true },
    ],
    returns: "void",
    description: "Places a marker on bars where a condition is true.",
  },
  fill: {
    kind: "output",
    parameters: [
      { name: "plot1", type: "plot" },
      { name: "plot2", type: "plot" },
      { name: "color", type: ["color", "string"], optional: true },
    ],
    returns: "void",
    description: "Fills the area between two plot outputs.",
  },
  alertcondition: {
    kind: "output",
    parameters: [
      { name: "condition", type: ["series<boolean>", "boolean"] },
      { name: "title", type: "string" },
    ],
    returns: "void",
    description: "Declares an alert condition for a script host that supports alerts.",
  },
}

function rollingDefinition(description: string): FunctionDefinition {
  return {
    kind: "function",
    parameters: [
      { name: "source", type: "series<number>" },
      { name: "length", type: "number" },
    ],
    returns: "series<number>",
    description,
  }
}

function optionalLengthDefinition(description: string): FunctionDefinition {
  const definition = rollingDefinition(description)
  definition.parameters[1].optional = true
  return definition
}

function signalDefinition(description: string): FunctionDefinition {
  return {
    kind: "function",
    parameters: [
      { name: "source1", type: ["series<number>", "number"] },
      { name: "source2", type: ["series<number>", "number"] },
    ],
    returns: "series<boolean>",
    description,
  }
}

function tupleDefinition(
  description: string,
  parameters: ParameterDefinition[],
  tupleReturns: FinScriptType[],
): FunctionDefinition {
  return {
    kind: "function",
    parameters,
    returns: "tuple",
    tupleReturns,
    description,
  }
}

const numericUnaryMath = [
  "abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor",
  "log", "log10", "round", "sign", "sin", "sqrt", "tan",
]

for (const name of numericUnaryMath) {
  LANGUAGE_DEFINITIONS[`math.${name}`] = {
    kind: "function",
    parameters: [{ name: "value", type: ["number", "series<number>"] }],
    returns: "unknown",
    description: `${name} applied to a number or numerical series.`,
  }
}

for (const name of ["min", "max", "avg", "pow"]) {
  LANGUAGE_DEFINITIONS[`math.${name}`] = {
    kind: "function",
    parameters: [
      { name: "value1", type: ["number", "series<number>"] },
      { name: "value2", type: ["number", "series<number>"] },
    ],
    returns: "unknown",
    description: `${name} applied element-by-element when a series is supplied.`,
  }
}

export const FINSCRIPT_KEYWORDS = ["true", "false", "and", "or", "not", "if", "else", "while", "for", "to", "na"]
