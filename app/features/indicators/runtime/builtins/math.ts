import { isNumericSeries, RuntimeValue, toNumericSeries } from "@/app/features/indicators/runtime/valueTypes";

type UnaryMath = (value: number) => number

const UNARY: Record<string, UnaryMath> = {
  "math.abs": Math.abs,
  "math.acos": Math.acos,
  "math.asin": Math.asin,
  "math.atan": Math.atan,
  "math.ceil": Math.ceil,
  "math.cos": Math.cos,
  "math.exp": Math.exp,
  "math.floor": Math.floor,
  "math.log": Math.log,
  "math.log10": Math.log10,
  "math.round": Math.round,
  "math.sign": Math.sign,
  "math.sin": Math.sin,
  "math.sqrt": Math.sqrt,
  "math.tan": Math.tan,
}

export function isMathFunction(name: string) {
  return name.startsWith("math.")
}

export function executeMathFunction(name: string, args: RuntimeValue[], length: number): RuntimeValue {
  const unary = UNARY[name]
  if (unary) {
    const value = args[0]
    if (typeof value === "number") return unary(value)
    return toNumericSeries(value, length).map(unary)
  }

  if (["math.min", "math.max", "math.avg", "math.pow"].includes(name)) {
    const left = args[0]
    const right = args[1]
    const apply = (a: number, b: number) => {
      if (name === "math.min") return Math.min(a, b)
      if (name === "math.max") return Math.max(a, b)
      if (name === "math.pow") return Math.pow(a, b)
      return (a + b) / 2
    }

    if (typeof left === "number" && typeof right === "number") return apply(left, right)
    const leftSeries = toNumericSeries(left, length)
    const rightSeries = toNumericSeries(right, length)
    return leftSeries.map((value, index) => apply(value, rightSeries[index]))
  }

  if (isNumericSeries(args[0])) return args[0]
  throw new Error(`Unsupported math function '${name}'.`)
}

