// app/indicators/editor/defaultScript.ts

export const DEFAULT_INDICATOR_SCRIPT = `//@finscript=1
indicator("My Indicator", overlay = true)

period = input.int(20, "Period")
basis = ta.sma(close, period)

plot(basis, "Basis", color = color.blue, linewidth = 2)
`
