import { CallExpression, Expression, IndicatorBox, IndicatorExecutionResult } from "@/app/indicators/language/types";
import { RawData } from "@/app/types/charts";
import { isBooleanSeries, isPlotHandle, RuntimeBoxHandle, RuntimeValue, toNumericSeries } from "./valueTypes";

const CONSTANTS: Record<string, string> = {
  "color.blue": "#2962FF",
  "color.orange": "#FF6D00",
  "color.green": "#00C853",
  "color.red": "#FF1744",
  "color.white": "#FFFFFF",
  "color.yellow": "#FFD600",
  "color.purple": "#AA00FF",
  "color.aqua": "#00E5FF",
  "color.gray": "#9E9E9E",
  "location.abovebar": "aboveBar",
  "location.belowbar": "belowBar",
  "location.inbar": "inBar",
  "location.absolute": "absolute",
  "shape.circle": "circle",
  "shape.square": "square",
  "shape.arrowup": "arrowUp",
  "shape.arrowdown": "arrowDown",
  "shape.labelup": "arrowUp",
  "shape.labeldown": "arrowDown",
  "plot.linebreak": "linebreak",
  "display.none": "none",
}

const argument = (call: CallExpression, name: string, index: number) =>
  call.args.find((entry) => entry.name === name)?.value
  ?? call.args.filter((entry) => !entry.name)[index]?.value

const expandHex = (value: string) => value.length <= 5
  ? value.slice(1).split("").map((digit) => digit + digit).join("")
  : value.slice(1)

export function withTransparency(color: string, transparency: number) {
  const alpha = Math.max(0, Math.min(1, 1 - transparency / 100))
  if (color.startsWith("#")) {
    const hex = expandHex(color)
    const red = Number.parseInt(hex.slice(0, 2), 16)
    const green = Number.parseInt(hex.slice(2, 4), 16)
    const blue = Number.parseInt(hex.slice(4, 6), 16)
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
  }
  const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  return rgb ? `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})` : color
}

export class IndicatorCustomization {
  readonly plots: IndicatorExecutionResult["plots"] = []
  readonly fills: IndicatorExecutionResult["fills"] = []
  readonly boxes: IndicatorExecutionResult["boxes"] = []
  readonly signals: IndicatorExecutionResult["signals"] = []

  constructor(
    private bars: RawData[],
    private overlay: boolean,
  ) {}

  constant(name: string) {
    return CONSTANTS[name]
  }

  handles(name: string) {
    return ["plot", "fill", "plotshape", "color.fade", "color.new"].includes(name)
  }

  execute(call: CallExpression, evaluate: (expression: Expression) => RuntimeValue): RuntimeValue {
    if (call.callee === "color.fade" || call.callee === "color.new") {
      const colorExpression = argument(call, "color", 0)
      const transparencyExpression = argument(call, "transparency", 1)
      const color = colorExpression ? evaluate(colorExpression) : "#2962FF"
      const transparency = transparencyExpression ? evaluate(transparencyExpression) : 0
      if (typeof color !== "string" || typeof transparency !== "number") {
        throw new Error(`${call.callee} requires a colour and numerical transparency.`)
      }
      return withTransparency(color, transparency)
    }

    if (call.callee === "plot") return this.plot(call, evaluate)
    if (call.callee === "fill") return this.fill(call, evaluate)
    if (call.callee === "plotshape") return this.plotShape(call, evaluate)
    throw new Error(`Unsupported customisation function '${call.callee}'.`)
  }

  createBox(box: Omit<IndicatorBox, "id">): RuntimeBoxHandle {
    const id = `box_${this.boxes.length}`
    this.boxes.push({ id, ...box })
    return { kind: "box-handle", id }
  }

  updateBox(handle: RuntimeBoxHandle, changes: Partial<Omit<IndicatorBox, "id">>) {
    const box = this.boxes.find((entry) => entry.id === handle.id)
    if (box) Object.assign(box, changes)
  }

  deleteBox(handle: RuntimeBoxHandle) {
    const index = this.boxes.findIndex((entry) => entry.id === handle.id)
    if (index >= 0) this.boxes.splice(index, 1)
  }

  outputs() {
    return {
      plots: this.plots,
      fills: this.fills,
      boxes: this.boxes,
      signals: this.signals,
    }
  }

  private plot(call: CallExpression, evaluate: (expression: Expression) => RuntimeValue): RuntimeValue {
    const seriesExpression = argument(call, "series", 0)
    if (!seriesExpression) throw new Error("plot requires a series.")
    const titleExpression = argument(call, "title", 1)
    const colorExpression = argument(call, "color", 2)
    const widthExpression = argument(call, "linewidth", 3)
    const styleExpression = argument(call, "style", 4)
    const displayExpression = argument(call, "display", 5)
    const values = toNumericSeries(evaluate(seriesExpression), this.bars.length)
    const title = titleExpression ? evaluate(titleExpression) : `Plot ${this.plots.length + 1}`
    const color = colorExpression ? evaluate(colorExpression) : "#2962FF"
    const width = widthExpression ? evaluate(widthExpression) : 2
    const style = styleExpression ? evaluate(styleExpression) : "line"
    const display = displayExpression ? evaluate(displayExpression) : "visible"
    const id = `plot_${this.plots.length}`

    this.plots.push({
      id,
      title: String(title),
      kind: "line",
      paneIndex: this.overlay ? 0 : 1,
      style: {
        color: String(color),
        lineWidth: Math.min(4, Math.max(1, Math.trunc(Number(width)))) as 1 | 2 | 3 | 4,
        lineBreak: style === "linebreak",
        visible: display !== "none",
      },
      points: values
        .map((value, index) => Number.isFinite(value)
          ? { time: this.bars[index].time, value }
          : { time: this.bars[index].time })
        .filter((point) => style === "linebreak" || point.value !== undefined),
    })
    return { kind: "plot-handle", id }
  }

  private fill(call: CallExpression, evaluate: (expression: Expression) => RuntimeValue): RuntimeValue {
    const firstExpression = argument(call, "plot1", 0)
    const secondExpression = argument(call, "plot2", 1)
    if (!firstExpression || !secondExpression) throw new Error("fill requires two plot handles.")
    const firstHandle = evaluate(firstExpression)
    const secondHandle = evaluate(secondExpression)
    if (!isPlotHandle(firstHandle) || !isPlotHandle(secondHandle)) {
      throw new Error("fill arguments must be values returned by plot().")
    }
    const first = this.plots.find((plot) => plot.id === firstHandle.id)
    const second = this.plots.find((plot) => plot.id === secondHandle.id)
    if (!first || !second) throw new Error("fill could not resolve its plot outputs.")
    const colorExpression = argument(call, "color", 2)
    const color = colorExpression ? String(evaluate(colorExpression)) : "rgba(41, 98, 255, 0.15)"
    const secondValues = new Map(second.points.map((point) => [point.time, point.value]))

    this.fills.push({
      id: `fill_${this.fills.length}`,
      title: `${first.title} / ${second.title}`,
      paneIndex: first.paneIndex,
      points: first.points.flatMap((point) => {
        const other = secondValues.get(point.time)
        return point.value === undefined || other === undefined ? [] : [{
          time: point.time,
          top: Math.max(point.value, other),
          bottom: Math.min(point.value, other),
          color,
        }]
      }),
    })
    return 0
  }

  private plotShape(call: CallExpression, evaluate: (expression: Expression) => RuntimeValue): RuntimeValue {
    const conditionExpression = argument(call, "condition", 0)
    if (!conditionExpression) throw new Error("plotshape requires a condition.")
    const titleExpression = argument(call, "title", 1)
    const colorExpression = argument(call, "color", 2)
    const locationExpression = argument(call, "location", 3)
    const shapeExpression = argument(call, "shape", 4)
    const textExpression = argument(call, "text", 5)
    const condition = evaluate(conditionExpression)
    const title = titleExpression ? String(evaluate(titleExpression)) : `Signal ${this.signals.length + 1}`
    const color = colorExpression ? String(evaluate(colorExpression)) : "#00C853"
    const location = locationExpression ? String(evaluate(locationExpression)) : "belowBar"
    const shapeValue = shapeExpression ? String(evaluate(shapeExpression)) : "arrowUp"
    const position = (["aboveBar", "belowBar", "inBar"].includes(location)
      ? location : "belowBar") as "aboveBar" | "belowBar" | "inBar"
    const shape = (["circle", "square", "arrowUp", "arrowDown"].includes(shapeValue)
      ? shapeValue : "arrowUp") as "circle" | "square" | "arrowUp" | "arrowDown"

    this.signals.push({
      id: `signal_${this.signals.length}`,
      title,
      style: {
        color,
        position,
        shape,
        text: textExpression ? String(evaluate(textExpression)) : title,
      },
      points: isBooleanSeries(condition)
        ? condition.map((visible, index) => ({ time: this.bars[index].time, visible }))
        : toNumericSeries(condition, this.bars.length).map((price, index) => ({
            time: this.bars[index].time,
            visible: Number.isFinite(price),
            price: Number.isFinite(price) ? price : undefined,
          })),
    })
    return 0
  }
}
