import { useEffect, useRef } from "react"
import { createSeriesMarkers, LineSeries, SeriesMarker } from "lightweight-charts";
import { RawData } from "@/app/components/types/charts";
import { AppliedIndicator } from "@/app/features/indicators/language/types";
import { executeIndicator } from "@/app/features/indicators/runtime/executor"
import { FinScriptPrimitivePlugin } from "@/app/features/indicators/plugins/finscriptplugin"

export function useScriptIndicators(
  chartRef: React.MutableRefObject<any>,
  priceSeriesRef: React.MutableRefObject<any>,
  data: RawData[],
  indicators: AppliedIndicator[],
  chartVersion: number,
) {
  const seriesMap = useRef<Map<string, any>>(new Map())
  const signalMarkers = useRef<ReturnType<typeof createSeriesMarkers> | null>(null)
  const primitivePlugin = useRef<FinScriptPrimitivePlugin | null>(null)
  const primitivePane = useRef<any>(null)

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const activeSeries = new Set<string>()
    const markers: SeriesMarker<number>[] = []
    const fills = [] as ReturnType<typeof executeIndicator>["fills"]
    const boxes = [] as ReturnType<typeof executeIndicator>["boxes"]

    for (const indicator of indicators) {
      if (!indicator.enabled) continue

      try {
        const result = executeIndicator({
          compiled: indicator.compiled,
          bars: data,
          inputs: indicator.inputs,
        })

        for (const plot of result.plots) {
          const key = `${indicator.id}:${plot.id}`
          activeSeries.add(key)
          let series = seriesMap.current.get(key)

          if (!series) {
            series = chart.addSeries(LineSeries, {
              color: plot.style.color,
              lineWidth: plot.style.lineWidth,
              priceLineVisible: false,
              lastValueVisible: true,
              title: plot.title,
              visible: plot.style.visible,
            }, plot.paneIndex)
            seriesMap.current.set(key, series)
          } else {
            series.applyOptions({
              color: plot.style.color,
              lineWidth: plot.style.lineWidth,
              title: plot.title,
              visible: plot.style.visible,
            })
          }

          series.setData(plot.points)
        }

        fills.push(...result.fills)
        boxes.push(...result.boxes)

        for (const signal of result.signals) {
          for (const point of signal.points) {
            if (!point.visible) continue
            markers.push(point.price === undefined
              ? {
                  time: point.time,
                  position: signal.style.position,
                  color: signal.style.color,
                  shape: signal.style.shape,
                  text: signal.style.text ?? signal.title,
                }
              : {
                  time: point.time,
                  position: "atPriceMiddle",
                  price: point.price,
                  color: signal.style.color,
                  shape: signal.style.shape,
                  text: signal.style.text ?? signal.title,
                })
          }
        }
      } catch (error) {
        console.error(`[FinScript] Failed to execute '${indicator.compiled.metadata.title}'.`, error)
      }
    }

    seriesMap.current.forEach((series, key) => {
      if (!activeSeries.has(key)) {
        chart.removeSeries(series)
        seriesMap.current.delete(key)
      }
    })

    markers.sort((left, right) => left.time - right.time)
    if (priceSeriesRef.current) {
      signalMarkers.current ??= createSeriesMarkers(priceSeriesRef.current)
      signalMarkers.current.setMarkers(markers)
    }

    if ((fills.length > 0 || boxes.length > 0) && priceSeriesRef.current) {
      if (!primitivePlugin.current) {
        primitivePlugin.current = new FinScriptPrimitivePlugin()
        primitivePlugin.current.setSeries(priceSeriesRef.current)
        primitivePane.current = chart.panes()[0]
        primitivePane.current.attachPrimitive(primitivePlugin.current)
      }
      primitivePlugin.current.setData(fills, boxes)
    } else if (primitivePlugin.current && primitivePane.current) {
      primitivePane.current.detachPrimitive(primitivePlugin.current)
      primitivePlugin.current = null
      primitivePane.current = null
    }
  }, [chartRef, chartVersion, data, indicators, priceSeriesRef])

  useEffect(() => {
    return () => {
      const chart = chartRef.current
      if (chart) {
        seriesMap.current.forEach((series) => chart.removeSeries(series))
      }
      seriesMap.current.clear()
      signalMarkers.current?.setMarkers([])
      signalMarkers.current = null
      if (primitivePlugin.current && primitivePane.current) {
        primitivePane.current.detachPrimitive(primitivePlugin.current)
      }
      primitivePlugin.current = null
      primitivePane.current = null
    }
  }, [chartRef, chartVersion, priceSeriesRef])
}
