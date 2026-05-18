import { useEffect, useRef } from "react"
import { StockTick } from "@/app/types/websocket"
import { LineSeries } from "lightweight-charts"

interface IndicatorConfig {
  sma?: { enabled: boolean, period: number }
  ema?: { enabled: boolean, period: number }
}

export type OHLCPoint = {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export type IndicatorPoint = {
  time: number
  value: number
}

export function computeSMA(data: StockTick[], period: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = []
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close
    }
    result.push({ time: data[i].time, value: sum / period })
  }
  return result
}

export function useIndicatorSeries(
  chartRef: React.MutableRefObject<any>,
  data: any[],
  config: IndicatorConfig
) {
  const smaRef = useRef<any>(null)

  useEffect(() => {
    if (!chartRef.current) return
    smaRef.current = chartRef.current.addSeries(LineSeries, {
      color: '#2962FF',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    return () => {
      chartRef.current?.removeSeries(smaRef.current)
    }
  }, [chartRef.current])

  useEffect(() => {
    if (!smaRef.current || !data.length) return
    smaRef.current.setData(computeSMA(data, config.sma?.period ?? 14))
  }, [data, config])
}