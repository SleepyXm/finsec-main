import { useEffect, useRef } from "react"
import { createSeriesMarkers, LineSeries, type SeriesMarker } from "lightweight-charts"
import { OHLCVBar, SeriesPoint, computeSMA, computeEMA } from "@/app/indicators/primitives"
import { computeSuperTrend, SuperTrendConfig } from "@/app/indicators/supertrend"
import { computeLiquidityVoids, LiquidityVoidConfig } from "@/app/indicators/liquidityvoids"
import { LiquidityVoidPlugin } from "@/app/indicators/plugins/liquidityvoidplugin"
import { SuperTrendFillPlugin } from "@/app/indicators/plugins/supertrendplugin"
import type { AppliedIndicator } from "@/app/indicators/language/types"
import { executeIndicator } from "@/app/indicators/runtime/executor"
import { FinScriptPrimitivePlugin } from "@/app/indicators/plugins/finscriptplugin"

// ── Types ─────────────────────────────────────────────────────────────────────

export type SeriesStyle = {
  color?: string
  lineWidth?: 1 | 2 | 3 | 4
}

export type SeriesIndicatorConfig = {
  sma?:        { enabled: boolean; period: number; style?: SeriesStyle }
  ema?:        { enabled: boolean; period: number; style?: SeriesStyle }
  supertrend?: { enabled: boolean; config?: SuperTrendConfig; style?: SeriesStyle }
}

export type ZoneIndicatorConfig = {
  liquidityVoid?: { enabled: boolean; config?: LiquidityVoidConfig }
}

export type IndicatorConfig = {
  series?: SeriesIndicatorConfig
  zones?:  ZoneIndicatorConfig
}

// ── Registries ────────────────────────────────────────────────────────────────

type SimpleCompute = (data: OHLCVBar[], period: number) => SeriesPoint[]
type SimpleSeriesKey = "sma" | "ema"

const SERIES_COMPUTE: Record<SimpleSeriesKey, SimpleCompute> = {
  sma: computeSMA,
  ema: computeEMA,
}

const DEFAULT_STYLES: Partial<Record<string, SeriesStyle>> = {
  sma:             { color: "#2962FF", lineWidth: 2 },
  ema:             { color: "#FF6D00", lineWidth: 2 },
  supertrend_up:   { color: "#00FFBB", lineWidth: 2 },
  supertrend_down: { color: "#FF1100", lineWidth: 2 },
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useIndicators(
  chartRef:  React.MutableRefObject<any>,
  seriesRef: React.MutableRefObject<any>,
  data:      OHLCVBar[],
  config:    IndicatorConfig
) {
  const seriesMap    = useRef<Map<string, any>>(new Map())
  const lvPlugin     = useRef<LiquidityVoidPlugin | null>(null)
  const lvHostSeries = useRef<any>(null)
  const stFillPlugin = useRef<SuperTrendFillPlugin | null>(null)

  // ── Series: mount / unmount ───────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return
    const cfg = config.series ?? {}

    for (const _key of Object.keys(cfg) as (keyof SeriesIndicatorConfig)[]) {
      const entry    = cfg[_key]
      const existing = _key === "supertrend"
        ? seriesMap.current.get("supertrend_up")
        : seriesMap.current.get(_key)
      if (!entry) continue

      if (entry.enabled && !existing) {
        if (_key === "supertrend") {
          for (const dir of ["supertrend_up", "supertrend_down"] as const) {
            const style = { ...DEFAULT_STYLES[dir], ...entry.style }
            seriesMap.current.set(dir, chartRef.current.addSeries(LineSeries, {
              color:            style.color,
              lineWidth:        style.lineWidth,
              priceLineVisible: false,
              lastValueVisible: false,
            }))
          }
        } else {
          const style = { ...DEFAULT_STYLES[_key], ...entry.style }
          seriesMap.current.set(_key, chartRef.current.addSeries(LineSeries, {
            color:            style.color,
            lineWidth:        style.lineWidth,
            priceLineVisible: false,
            lastValueVisible: false,
          }))
        }
      }

      if (!entry.enabled && existing) {
        if (_key === "supertrend") {
          for (const dir of ["supertrend_up", "supertrend_down"]) {
            const s = seriesMap.current.get(dir)
            if (s) { chartRef.current.removeSeries(s); seriesMap.current.delete(dir) }
          }
        } else {
          chartRef.current.removeSeries(existing)
          seriesMap.current.delete(_key)
        }
      }
    }

    return () => {
      seriesMap.current.forEach(s => chartRef.current?.removeSeries(s))
      seriesMap.current.clear()
    }
  }, [chartRef.current, config.series])

  // ── SuperTrend fill: mount / unmount ──────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return
    const st = config.series?.supertrend

    if (st?.enabled && !stFillPlugin.current) {
      stFillPlugin.current = new SuperTrendFillPlugin()
      stFillPlugin.current.setSeries(seriesRef.current)
      chartRef.current.panes()[0].attachPrimitive(stFillPlugin.current)
    }

    if (!st?.enabled && stFillPlugin.current) {
      chartRef.current.panes()[0].detachPrimitive(stFillPlugin.current)
      stFillPlugin.current = null
    }

    return () => {
      if (stFillPlugin.current) {
        chartRef.current?.panes()[0].detachPrimitive(stFillPlugin.current)
        stFillPlugin.current = null
      }
    }
  }, [chartRef.current, config.series?.supertrend?.enabled])

  // ── Liquidity void: mount / unmount ───────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return
    const lv = config.zones?.liquidityVoid

    if (lv?.enabled && !lvPlugin.current) {
      lvHostSeries.current = chartRef.current.addSeries(LineSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
        visible:          false,
      })
      lvPlugin.current = new LiquidityVoidPlugin()
      lvPlugin.current.setSeries(seriesRef.current)
      lvHostSeries.current.attachPrimitive(lvPlugin.current)
    }

    if (!lv?.enabled && lvPlugin.current) {
      lvHostSeries.current?.detachPrimitive(lvPlugin.current)
      chartRef.current.removeSeries(lvHostSeries.current)
      lvPlugin.current     = null
      lvHostSeries.current = null
    }

    return () => {
      if (lvPlugin.current && lvHostSeries.current) {
        lvHostSeries.current.detachPrimitive(lvPlugin.current)
        chartRef.current?.removeSeries(lvHostSeries.current)
        lvPlugin.current     = null
        lvHostSeries.current = null
      }
    }
  }, [chartRef.current, config.zones?.liquidityVoid?.enabled])

  // ── Recompute all on data / config change ─────────────────────────────────
  useEffect(() => {
    if (!data.length) return
    const cfg = config.series ?? {}

    // SMA, EMA
    for (const _key of Object.keys(SERIES_COMPUTE) as SimpleSeriesKey[]) {
      const entry   = cfg[_key]
      const series  = seriesMap.current.get(_key)
      const compute = SERIES_COMPUTE[_key]
      if (!entry?.enabled || !series || !compute) continue
      series.setData(compute(data, entry.period))
    }

    // SuperTrend
    const st = cfg.supertrend
    if (st?.enabled) {
      const upSeries   = seriesMap.current.get("supertrend_up")
      const downSeries = seriesMap.current.get("supertrend_down")
      if (upSeries && downSeries) {
        const points = computeSuperTrend(data, st.config)
        upSeries.setData(points
          .filter(p => p.direction === -1)
          .map(p => ({ time: p.time, value: p.value }))
        )
        downSeries.setData(points
          .filter(p => p.direction === 1)
          .map(p => ({ time: p.time, value: p.value }))
        )
        stFillPlugin.current?.setData(points, data)
      }
    }

    // Liquidity void
    const lv = config.zones?.liquidityVoid
    if (lv?.enabled && lvPlugin.current) {
      lvPlugin.current.setZones(computeLiquidityVoids(data, lv.config))
    }

  }, [data, config])
}

// Generic FinScript output path. The legacy hook above remains available for
// the hand-written SuperTrend and liquidity-void implementations while the
// language grows support for custom primitives.
export function useScriptIndicators(
  chartRef: React.MutableRefObject<any>,
  priceSeriesRef: React.MutableRefObject<any>,
  data: OHLCVBar[],
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
