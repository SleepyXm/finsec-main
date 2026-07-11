import type { RuntimeValue } from "@/app/indicators/runtime/valueTypes"

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
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  return color
}

export function isColorFunction(name: string) {
  return name === "color.fade" || name === "color.new"
}

export function executeColorFunction(name: string, args: RuntimeValue[]): RuntimeValue {
  if (!isColorFunction(name)) throw new Error(`Unsupported colour function '${name}'.`)
  const color = args[0]
  const transparency = args[1]
  if (typeof color !== "string" || typeof transparency !== "number") {
    throw new Error(`${name} requires a colour and numerical transparency.`)
  }
  return withTransparency(color, transparency)
}
