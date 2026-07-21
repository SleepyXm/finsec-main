/* eslint-disable @typescript-eslint/no-explicit-any */

import { IndicatorBox, IndicatorFill } from "@/app/features/indicators/language/types";
import { IPanePrimitivePaneView, IPrimitivePaneRenderer, PaneAttachedParameter, PrimitivePaneViewZOrder, Time } from "lightweight-charts";

class FinScriptPrimitiveRenderer implements IPrimitivePaneRenderer {
  constructor(private plugin: FinScriptPrimitivePlugin) {}

  draw(target: any): void {
    target.useBitmapCoordinateSpace((scope: any) => {
      const context = scope.context as CanvasRenderingContext2D
      const ratio = scope.horizontalPixelRatio

      for (const fill of this.plugin.fills) {
        for (const point of fill.points) {
          const x = this.plugin.timeToX(point.time)
          const top = this.plugin.priceToY(point.top)
          const bottom = this.plugin.priceToY(point.bottom)
          if (x === null || top === null || bottom === null) continue
          const y = Math.min(top, bottom)
          const height = Math.abs(bottom - top)
          if (height < 0.5) continue
          context.fillStyle = point.color
          context.fillRect(
            (x - this.plugin.barWidth / 2) * ratio,
            y * ratio,
            this.plugin.barWidth * ratio,
            height * ratio,
          )
        }
      }

      for (const box of this.plugin.boxes) {
        const left = this.plugin.timeToX(box.leftTime)
        const right = box.extendRight
          ? this.plugin.rightEdgeX
          : box.rightTime === undefined
            ? left === null ? null : left + this.plugin.barWidth
            : this.plugin.timeToX(box.rightTime)
        const top = this.plugin.priceToY(box.top)
        const bottom = this.plugin.priceToY(box.bottom)
        if (left === null || right === null || top === null || bottom === null) continue

        const x = Math.min(left, right)
        const y = Math.min(top, bottom)
        const width = Math.max(1, Math.abs(right - left))
        const height = Math.max(1, Math.abs(bottom - top))
        context.fillStyle = box.fillColor
        context.fillRect(x * ratio, y * ratio, width * ratio, height * ratio)

        if (box.borderColor && box.borderWidth > 0) {
          context.strokeStyle = box.borderColor
          context.lineWidth = box.borderWidth * ratio
          context.strokeRect(x * ratio, y * ratio, width * ratio, height * ratio)
        }
      }
    })
  }
}

class FinScriptPrimitivePaneView implements IPanePrimitivePaneView {
  constructor(private plugin: FinScriptPrimitivePlugin) {}

  zOrder(): PrimitivePaneViewZOrder {
    return "normal"
  }

  renderer(): IPrimitivePaneRenderer {
    return new FinScriptPrimitiveRenderer(this.plugin)
  }
}

export class FinScriptPrimitivePlugin {
  fills: IndicatorFill[] = []
  boxes: IndicatorBox[] = []
  priceToY: (price: number) => number | null = () => null
  timeToX: (time: number) => number | null = () => null
  rightEdgeX = 0
  barWidth = 8

  private paneView = new FinScriptPrimitivePaneView(this)
  private chart: any = null
  private series: any = null
  private requestUpdate?: () => void

  setSeries(series: any) {
    this.series = series
  }

  attached(parameter: PaneAttachedParameter<Time>) {
    this.chart = (parameter as any).chart
    this.requestUpdate = (parameter as any).requestUpdate
  }

  detached() {
    this.chart = null
    this.requestUpdate = undefined
  }

  updateAllViews() {
    if (!this.chart) return
    const timeScale = this.chart.timeScale()
    this.priceToY = (price) => this.series?.priceToCoordinate(price) ?? null
    this.timeToX = (time) => {
      try { return timeScale.timeToCoordinate(time) }
      catch { return null }
    }
    const visibleRange = timeScale.getVisibleRange()
    this.rightEdgeX = visibleRange ? timeScale.timeToCoordinate(visibleRange.to) ?? 0 : 0
    this.barWidth = timeScale.options().barSpacing ?? 8
  }

  paneViews(): IPanePrimitivePaneView[] {
    return [this.paneView]
  }

  setData(fills: IndicatorFill[], boxes: IndicatorBox[]) {
    this.fills = fills
    this.boxes = boxes
    this.requestUpdate?.()
  }
}
