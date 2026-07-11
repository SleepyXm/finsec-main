export type RuntimeScalar = number | boolean | string
export type RuntimeSeries = number[] | boolean[]
export type RuntimeTuple = { kind: "tuple"; values: RuntimeValue[] }
export type RuntimePlotHandle = { kind: "plot-handle"; id: string }
export type RuntimeBoxHandle = { kind: "box-handle"; id: string }
export type RuntimeValue = RuntimeScalar | RuntimeSeries | RuntimeTuple | RuntimePlotHandle | RuntimeBoxHandle

export function isTuple(value: RuntimeValue): value is RuntimeTuple {
  return typeof value === "object" && !Array.isArray(value) && value.kind === "tuple"
}

export function isPlotHandle(value: RuntimeValue): value is RuntimePlotHandle {
  return typeof value === "object" && !Array.isArray(value) && value.kind === "plot-handle"
}

export function isBoxHandle(value: RuntimeValue): value is RuntimeBoxHandle {
  return typeof value === "object" && !Array.isArray(value) && value.kind === "box-handle"
}

export function isSeries(value: RuntimeValue): value is RuntimeSeries {
  return Array.isArray(value)
}

export function isNumericSeries(value: RuntimeValue): value is number[] {
  return Array.isArray(value) && (value.length === 0 || typeof value[0] === "number")
}

export function isBooleanSeries(value: RuntimeValue): value is boolean[] {
  return Array.isArray(value) && (value.length === 0 || typeof value[0] === "boolean")
}

export function toNumericSeries(value: RuntimeValue, length: number): number[] {
  if (isNumericSeries(value)) return value
  if (typeof value === "number") return new Array(length).fill(value)
  throw new Error("Expected a numerical value or series.")
}

export function toBooleanSeries(value: RuntimeValue, length: number): boolean[] {
  if (isBooleanSeries(value)) return value
  if (typeof value === "boolean") return new Array(length).fill(value)
  throw new Error("Expected a boolean value or series.")
}

export function toPeriod(value: RuntimeValue): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    throw new Error("Indicator lengths must be positive numbers.")
  }
  return Math.max(1, Math.trunc(value))
}
