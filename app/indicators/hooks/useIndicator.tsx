import { useEffect, useRef } from "react"
import { LineSeries } from "lightweight-charts"
import { OHLCVBar, SeriesPoint, computeSMA, computeEMA  } from "../primitives"
import { computeSuperTrend, SuperTrendConfig } from "../supertrend"
import { computeLiquidityVoids, LiquidityVoidConfig } from "@/app/indicators/liquidityvoids"
import { LiquidityVoidPlugin } from "@/app/indicators/plugins/liquidityvoidplugin"

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

const SERIES_COMPUTE: Partial<Record<keyof SeriesIndicatorConfig, SimpleCompute>> = {
  sma: computeSMA,
  ema: computeEMA,
}

const DEFAULT_STYLES: Partial<Record<keyof SeriesIndicatorConfig, SeriesStyle>> = {
  sma:        { color: "#2962FF", lineWidth: 2 },
  ema:        { color: "#FF6D00", lineWidth: 2 },
  supertrend: { color: "#00FFBB", lineWidth: 2 },
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useIndicators(
  chartRef: React.MutableRefObject<any>,
  seriesRef: React.MutableRefObject<any>,
  data: OHLCVBar[],
  config: IndicatorConfig
) {
  const seriesMap   = useRef<Map<string, any>>(new Map())
  const lvPlugin    = useRef<LiquidityVoidPlugin | null>(null)
  const lvHostSeries = useRef<any>(null)

  // ── Series: mount / unmount ───────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return
    const cfg = config.series ?? {}

    for (const _key of Object.keys(cfg) as (keyof SeriesIndicatorConfig)[]) {
      const entry    = cfg[_key]
      const existing = seriesMap.current.get(_key)
      if (!entry) continue

      if (entry.enabled && !existing) {
        const style = { ...DEFAULT_STYLES[_key], ...entry.style }
        const series = chartRef.current.addSeries(LineSeries, {
          color:            style.color,
          lineWidth:        style.lineWidth,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        seriesMap.current.set(_key, series)
      }

      if (!entry.enabled && existing) {
        chartRef.current.removeSeries(existing)
        seriesMap.current.delete(_key)
      }
    }

    return () => {
      seriesMap.current.forEach(s => chartRef.current?.removeSeries(s))
      seriesMap.current.clear()
    }
  }, [chartRef.current, config.series])

  // ── Series: recompute on data / config change ─────────────────────────────
  useEffect(() => {
    if (!data.length) return
    const cfg = config.series ?? {}

    // Simple period-based indicators — SMA, EMA
    for (const _key of Object.keys(SERIES_COMPUTE) as (keyof typeof SERIES_COMPUTE)[]) {
      const entry   = cfg[_key]
      const series  = seriesMap.current.get(_key)
      const compute = SERIES_COMPUTE[_key]
      if (!entry?.enabled || !series || !compute) continue
      series.setData(compute(data, entry.period))
    }

    // SuperTrend — separate because it takes a config object not a period
    const st = cfg.supertrend
    if (st?.enabled) {
      const series = seriesMap.current.get("supertrend")
      if (series) {
        const points = computeSuperTrend(data, st.config)
        // Split into up/down series so colour can differ per direction
        const up   = points.filter(p => p.direction === -1).map(p => ({ time: p.time, value: p.value }))
        const down = points.filter(p => p.direction ===  1).map(p => ({ time: p.time, value: p.value }))
        // For now push both into the same series — split series is a follow up
        series.setData([...up, ...down].sort((a, b) => a.time - b.time))
      }
    }

  }, [data, config.series])

  // ── Zones: mount liquidity void plugin on empty host series ──────────────
  useEffect(() => {
    if (!chartRef.current) return
    const lv = config.zones?.liquidityVoid

    if (lv?.enabled && !lvPlugin.current) {
      // Empty host series — never gets data, just carries the primitive
      lvHostSeries.current = chartRef.current.addSeries(LineSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
        visible: false,
      })
      lvPlugin.current = new LiquidityVoidPlugin()
      lvPlugin.current.setSeries(seriesRef.current)
      lvHostSeries.current.attachPrimitive(lvPlugin.current)
    }

    if (!lv?.enabled && lvPlugin.current) {
      lvHostSeries.current?.detachPrimitive(lvPlugin.current)
      chartRef.current.removeSeries(lvHostSeries.current)
      lvPlugin.current    = null
      lvHostSeries.current = null
    }

    return () => {
      if (lvPlugin.current && lvHostSeries.current) {
        lvHostSeries.current.detachPrimitive(lvPlugin.current)
        chartRef.current?.removeSeries(lvHostSeries.current)
        lvPlugin.current    = null
        lvHostSeries.current = null
      }
    }
  }, [chartRef.current, config.zones?.liquidityVoid?.enabled])

  // ── Zones: recompute and push to plugin ───────────────────────────────────
  useEffect(() => {
    if (!data.length || !lvPlugin.current) return
    const lv = config.zones?.liquidityVoid
    if (!lv?.enabled) return
    const zones = computeLiquidityVoids(data, lv.config)
    lvPlugin.current.setZones(zones)
  }, [data, config.zones?.liquidityVoid])
}