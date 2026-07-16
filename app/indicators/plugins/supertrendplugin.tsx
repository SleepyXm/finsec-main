import {
  IPanePrimitivePaneView,
  IPrimitivePaneRenderer,
  PrimitivePaneViewZOrder,
  PaneAttachedParameter,
  Time,
} from "lightweight-charts"
import { SuperTrendPoint } from "../supertrend"
import type { RawData } from "@/app/types/charts"

// ── Types ─────────────────────────────────────────────────────────────────────

export type FillZone = {
  time:      number
  stValue:   number   // ST line
  bodyMid:   number   // (open + close) / 2
  direction: 1 | -1
}

// ── Renderer ──────────────────────────────────────────────────────────────────

class SuperTrendFillRenderer implements IPrimitivePaneRenderer {
  private zones:    FillZone[]
  private priceToY: (price: number) => number | null
  private timeToX:  (time: number) => number | null
  private barWidth: number
  private colors:   { bull: [string, string]; bear: [string, string] }

  constructor(
    zones:    FillZone[],
    priceToY: (price: number) => number | null,
    timeToX:  (time: number) => number | null,
    barWidth: number,
    colors:   { bull: [string, string]; bear: [string, string] }
  ) {
    this.zones    = zones
    this.priceToY = priceToY
    this.timeToX  = timeToX
    this.barWidth = barWidth
    this.colors   = colors
  }

  draw(target: any): void {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx   = scope.context as CanvasRenderingContext2D
      const ratio = scope.horizontalPixelRatio

      for (const zone of this.zones) {
        const x      = this.timeToX(zone.time)
        const yST    = this.priceToY(zone.stValue)
        const yBody  = this.priceToY(zone.bodyMid)

        if (x === null || yST === null || yBody === null) continue

        const xPx    = x     * ratio
        const ySTpx  = yST   * ratio
        const yBodypx = yBody * ratio
        const w      = this.barWidth * ratio
        const top    = Math.min(ySTpx, yBodypx)
        const bottom = Math.max(ySTpx, yBodypx)
        const height = bottom - top

        if (height < 1) continue

        const grad = ctx.createLinearGradient(0, top, 0, bottom)

        if (zone.direction === -1) {
          // Bullish: ST below price
          // top = bodyMid (price), bottom = ST line
          // fade from transparent at price → strong green at ST
          grad.addColorStop(0, this.colors.bull[1])  // transparent at body
          grad.addColorStop(1, this.colors.bull[0])  // strong at ST line
        } else {
          // Bearish: ST above price
          // top = ST line, bottom = bodyMid (price)
          // strong red at ST → fade to transparent at price
          grad.addColorStop(0, this.colors.bear[0])  // strong at ST line
          grad.addColorStop(1, this.colors.bear[1])  // transparent at body
        }

        ctx.fillStyle = grad
        ctx.fillRect(xPx - w / 2, top, w, height)
      }
    })
  }
}

// ── Pane View ─────────────────────────────────────────────────────────────────

class SuperTrendFillPaneView implements IPanePrimitivePaneView {
  private _plugin: SuperTrendFillPlugin

  constructor(plugin: SuperTrendFillPlugin) {
    this._plugin = plugin
  }

  zOrder(): PrimitivePaneViewZOrder {
    return "normal"
  }

  renderer(): IPrimitivePaneRenderer {
    return new SuperTrendFillRenderer(
      this._plugin.zones,
      this._plugin.priceToY,
      this._plugin.timeToX,
      this._plugin.barWidth,
      this._plugin.colors
    )
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export class SuperTrendFillPlugin {
  zones:    FillZone[]                        = []
  priceToY: (price: number) => number | null = () => null
  timeToX:  (time: number) => number | null  = () => null
  barWidth: number                           = 8
  colors = {
    bull: ["rgba(0, 255, 187, 0.4)", "rgba(0, 255, 187, 0.0)"] as [string, string],
    bear: ["rgba(255, 17,  0,  0.4)", "rgba(255, 17,  0,  0.0)"] as [string, string],
  }

  private _paneView       = new SuperTrendFillPaneView(this)
  private _chart: any     = null
  private _series: any    = null
  private _requestUpdate?: () => void

  setSeries(series: any): void {
    this._series = series
  }

  attached(param: PaneAttachedParameter<Time>): void {
    this._chart         = (param as any).chart
    this._requestUpdate = (param as any).requestUpdate
  }

  detached(): void {
    this._chart  = null
    this._series = null
  }

  updateAllViews(): void {
    if (!this._chart) return
    const timeScale = this._chart.timeScale()

    this.priceToY = (price: number) =>
      this._series?.priceToCoordinate(price) ?? null

    this.timeToX = (time: number) => {
      try { return timeScale.timeToCoordinate(time) }
      catch { return null }
    }

    this.barWidth = timeScale.options().barSpacing ?? 8
  }

  paneViews(): IPanePrimitivePaneView[] {
    return [this._paneView]
  }

  setData(points: SuperTrendPoint[], bars: RawData[]): void {
    const barMap = new Map(bars.map(b => [b.time, b]))
    this.zones = points.map(p => {
      const bar = barMap.get(p.time)
      if (!bar) return null
      return {
        time:      p.time,
        stValue:   p.value,
        bodyMid:   (bar.open + bar.close) / 2,
        direction: p.direction,
      }
    }).filter(Boolean) as FillZone[]
    this._requestUpdate?.()
  }

  setColors(colors: Partial<typeof this.colors>): void {
    this.colors = { ...this.colors, ...colors }
    this._requestUpdate?.()
  }
}
