// app/indicators/editor/defaultScript.ts

export const DEFAULT_INDICATOR_SCRIPT = `indicator("My Indicator", overlay=true)

period = input.number("Period", 20)
basis = sma(close, period)

plot("Basis", basis)
`