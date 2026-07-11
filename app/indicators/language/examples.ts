export type FinScriptExample = {
  id: string
  title: string
  description: string
  source: string
}

export const FINSCRIPT_EXAMPLES: FinScriptExample[] = [
  {
    id: "moving-average-suite",
    title: "Moving Average Suite",
    description: "Compares simple, exponential, Wilder, weighted, and volume-weighted averages.",
    source: `//@finscript=1
indicator("Moving Average Suite", overlay = true)

length = input.int(20, "Length")
plot(ta.sma(close, length), "SMA", color = color.blue)
plot(ta.ema(close, length), "EMA", color = color.orange)
plot(ta.rma(close, length), "RMA", color = color.purple)
plot(ta.wma(close, length), "WMA", color = color.green)
plot(ta.vwma(close, length), "VWMA", color = color.aqua)`,
  },
  {
    id: "bollinger-bands",
    title: "Bollinger Bands",
    description: "Exercises rolling deviation and tuple outputs.",
    source: `//@finscript=1
indicator("Bollinger Bands", overlay = true)

length = input.int(20, "Length")
multiplier = input.float(2, "Deviation")
[middle, upper, lower] = ta.bb(close, length, multiplier)
plot(middle, "Middle", color = color.blue)
plot(upper, "Upper", color = color.orange)
plot(lower, "Lower", color = color.orange)`,
  },
  {
    id: "macd",
    title: "MACD",
    description: "Exercises a three-series tuple in a separate pane.",
    source: `//@finscript=1
indicator("MACD", overlay = false)

[macd, signal, histogram] = ta.macd(close, 12, 26, 9)
plot(macd, "MACD", color = color.blue)
plot(signal, "Signal", color = color.orange)
plot(histogram, "Histogram", color = color.gray)`,
  },
  {
    id: "ema-cross",
    title: "EMA Cross Signals",
    description: "Exercises boolean series, cross detection, and chart markers.",
    source: `//@finscript=1
indicator("EMA Cross Signals", overlay = true)

fast = ta.ema(close, input.int(9, "Fast"))
slow = ta.ema(close, input.int(21, "Slow"))
bullish = ta.crossover(fast, slow)
bearish = ta.crossunder(fast, slow)
plot(fast, "Fast EMA", color = color.blue)
plot(slow, "Slow EMA", color = color.orange)
plotshape(bullish, "Bullish", color.green, location.belowbar, shape.arrowup)
plotshape(bearish, "Bearish", color.red, location.abovebar, shape.arrowdown)`,
  },
  {
    id: "filled-atr-channel",
    title: "Filled ATR Channel",
    description: "Builds volatility bands and a code-defined fill from reusable plot handles.",
    source: `//@finscript=1
indicator("Filled ATR Channel", overlay = true)

factor = input.float(3, "Factor")
atrLength = input.int(10, "ATR Length")
channelColor = input.color(#2962ff, "Channel Color")
atr = ta.atr(atrLength)
upper = hl2 + factor * atr
lower = hl2 - factor * atr
upperPlot = plot(upper, "Upper ATR Band", color = color.fade(channelColor, 20), linewidth = 2)
lowerPlot = plot(lower, "Lower ATR Band", color = color.fade(channelColor, 20), linewidth = 2)
fill(upperPlot, lowerPlot, color = color.fade(channelColor, 85))`,
  },
]
