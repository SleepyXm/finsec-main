import { IPanePrimitivePaneView, IPrimitivePaneRenderer, PrimitivePaneViewZOrder, PaneAttachedParameter, Time } from "lightweight-charts";
import { LiquidityVoidZone } from "../liquidityvoids"

// ── Renderer ──────────────────────────────────────────────────────────────────

class LiquidityVoidRenderer implements IPrimitivePaneRenderer {
  private zones:      LiquidityVoidZone[]
  private priceToY:   (price: number) => number | null
  private timeToX:    (time: number) => number | null
  private rightEdgeX: number
  private colors:     { bull: string; bear: string; filled: string }

  constructor(
    zones:      LiquidityVoidZone[],
    priceToY:   (price: number) => number | null,
    timeToX:    (time: number) => number | null,
    rightEdgeX: number,
    colors:     { bull: string; bear: string; filled: string }
  ) {
    this.zones      = zones
    this.priceToY   = priceToY
    this.timeToX    = timeToX
    this.rightEdgeX = rightEdgeX
    this.colors     = colors
  }

  draw(target: any): void {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx   = scope.context as CanvasRenderingContext2D
      const ratio = scope.horizontalPixelRatio

      for (const zone of this.zones) {
        const x1 = this.timeToX(zone.startTime)
        const x2 = zone.endTime ? this.timeToX(zone.endTime) : this.rightEdgeX
        const y1 = this.priceToY(zone.top)
        const y2 = this.priceToY(zone.bottom)

        if (x1 === null || x2 === null || y1 === null || y2 === null) continue
        console.log({ x1, x2, y1, y2 })

        ctx.fillStyle = zone.status === "filled"
          ? this.colors.filled
          : zone.direction === "bull"
            ? this.colors.bull
            : this.colors.bear

        ctx.fillRect(
          x1 * ratio,
          y1 * ratio,
          (x2 - x1) * ratio,
          (y2 - y1) * ratio
        )
      }
    })
  }
}

// ── Pane View ─────────────────────────────────────────────────────────────────

class LiquidityVoidPaneView implements IPanePrimitivePaneView {
  private _plugin: LiquidityVoidPlugin

  constructor(plugin: LiquidityVoidPlugin) {
    this._plugin = plugin
  }

  zOrder(): PrimitivePaneViewZOrder {
    return "normal"
  }

  renderer(): IPrimitivePaneRenderer {
    return new LiquidityVoidRenderer(
      this._plugin.zones,
      this._plugin.priceToY,
      this._plugin.timeToX,
      this._plugin.rightEdgeX,
      this._plugin.colors
    )
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────
// Implements IPanePrimitive<Time> — attach via chart.panes()[0].attachPrimitive()

export class LiquidityVoidPlugin {
  zones:      LiquidityVoidZone[]                  = []
  priceToY:   (price: number) => number | null     = () => null
  timeToX:    (time: number) => number | null      = () => null
  rightEdgeX: number                               = 0
  colors = {
    bull:   "rgba(0, 153, 129, 0.27)",
    bear:   "rgba(242, 54, 69, 0.27)",
    filled: "rgba(120, 123, 134, 0.27)",
  }

  private _paneView        = new LiquidityVoidPaneView(this)
  private _chart: any      = null
  private _series: any     = null   // candlestick series passed in for priceToCoordinate
  private _requestUpdate?: () => void

  // series ref needed for price → coordinate conversion
  // pass your candlestick seriesRef.current here
  setSeries(series: any): void {
    this._series = series
  }

  // Called by LW when attached to pane
  attached(param: PaneAttachedParameter<Time>): void {
    this._chart          = (param as any).chart
    this._requestUpdate  = (param as any).requestUpdate
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

    const visibleRange = timeScale.getVisibleRange()
    this.rightEdgeX = visibleRange
      ? (timeScale.timeToCoordinate(visibleRange.to) ?? 0)
      : 0
  }

  paneViews(): IPanePrimitivePaneView[] {
    return [this._paneView]
  }

  setZones(zones: LiquidityVoidZone[]): void {
    this.zones = zones
    this._requestUpdate?.()
  }

  setColors(colors: Partial<typeof this.colors>): void {
    this.colors = { ...this.colors, ...colors }
    this._requestUpdate?.()
  }
}