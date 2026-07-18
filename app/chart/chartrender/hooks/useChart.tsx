import React, { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode } from "lightweight-charts";
import { defaultChartTheme, ChartBackground, ChartTheme } from "../themes/themes";
import { PriceLines } from "@/app/components/trading/price";
import { StrategyOverlay } from "../overlays/Strategy";
import { StrategyTeachingOverlay } from "../overlays/StrategyTeachingOverlay";
import { buildValidationMarks, SemanticMark, SemanticMarksOverlay } from "../overlays/SemanticMarksOverlay";
import { useCandleHighlight } from "@/app/chart/chartrender/overlays/CandleHighlight";
import { useScriptIndicators } from "@/app/indicators/hooks/useIndicator";
import { AppliedIndicator } from "@/app/indicators/language/types";
import { PositionTags } from "@/app/chart/chartrender/overlays/PositionOverlay";
import { ACCENT, DANGER, SUCCESS } from "@/app/ui";
import type { StrategyTeachingState, ValidationState } from "@/app/chart/chartcontext";

type ChartPlugins = {
  data?: any[];
  trades?: any[];
  positions?: any[];
  livePnLMap?: Record<string, number>;

  renderTradeUI?: React.ReactNode;

  isCreatingStrategy?: boolean;
  onAnnotation?: (annotation: any) => void;
  onScrollLeft?: () => void;

  enableStrategyOverlay?: boolean;
  enableIndicators?: boolean;
  appliedIndicators?: AppliedIndicator[];

  getPositionLabel?: (position: any) => string;
  onClosePosition?: (id: string) => void;
  updatePosition?: (id: string, patch: any) => void | Promise<void>;
  fitContent?: boolean;
  validation?: ValidationState;
  strategyTeaching?: StrategyTeachingState | null;
  semanticMarks?: SemanticMark[];
  semanticMarksCompact?: boolean;
};

export function resolveBackground(bg: ChartBackground) {
  switch (bg.type) {
    case "solid":
      return {
        type: ColorType.Solid,
        color: bg.color,
      };

    case "gradient":
      return {
        type: ColorType.VerticalGradient,
        topColor: bg.topColor,
        bottomColor: bg.bottomColor,
      };

    case "transparent":
    default:
      return {
        type: ColorType.Solid,
        color: "transparent",
      };
  }
}

export function useChart(
  seriesConstructor: any,
  seriesOptions: any = {},
  chartOptions: any = {},
  plugins: ChartPlugins = {},
  theme: ChartTheme = defaultChartTheme,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const positionLinesRef = useRef<Map<string, any>>(new Map());

  const [chartKey, setChartKey] = useState(0);
  const [overlayVersion, setOverlayVersion] = useState(0);

  const data = plugins.data ?? [];
  const trades = plugins.trades ?? [];
  const positions = plugins.positions ?? [];

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: resolveBackground(theme.background),
        textColor: theme.text,
      },

      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },

      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,

      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },

      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },

      timeScale: {
        rightOffset: 30,
        timeVisible: true,
        secondsVisible: false,
        ...chartOptions.timeScale,
      },

      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: theme.crosshair },
        horzLine: { color: theme.crosshair },
        ...chartOptions.crosshair,
      },

      ...chartOptions.extra,
    });

    const series = chart.addSeries(seriesConstructor, seriesOptions);

    chartRef.current = chart;
    seriesRef.current = series;

    setChartKey((k) => k + 1);

    const observer = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;

      chartRef.current.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();

      priceLinesRef.current = [];
      positionLinesRef.current.clear();

      chart.remove();

      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [seriesConstructor]);

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    chartRef.current.applyOptions({
      layout: {
        background: resolveBackground(theme.background),
        textColor: theme.text,
      },

      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },

      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: theme.crosshair },
        horzLine: { color: theme.crosshair },
        ...chartOptions.crosshair,
      },
    });

    seriesRef.current.applyOptions(seriesOptions);
  }, [theme, seriesOptions, chartOptions, chartKey]);

  useEffect(() => {
    if (!seriesRef.current) return;

    if (!chartRef.current || !containerRef.current) {
      seriesRef.current.setData(data);
      return;
    }

    if (plugins.fitContent) {
      seriesRef.current.setData(data);
      chartRef.current.timeScale().fitContent();
      return;
    }

    if (data.length < 2) {
      seriesRef.current.setData(data);
      return;
    }

    const interval = data[1].time - data[0].time;
    const lastCandle = data[data.length - 1];
    const barSpacing = chartRef.current.timeScale().options().barSpacing;
    const containerWidth = containerRef.current.clientWidth;

    if (
      !Number.isFinite(interval) ||
      interval <= 0 ||
      !Number.isFinite(barSpacing) ||
      barSpacing <= 0 ||
      !containerWidth
    ) {
      seriesRef.current.setData(data);
      return;
    }

    const visibleBars = Math.ceil(containerWidth / barSpacing);
    const whitespace = [];

    for (let i = 1; i <= visibleBars; i++) {
      whitespace.push({
        time: lastCandle.time + interval * i,
      });
    }

    seriesRef.current.setData([...data, ...whitespace]);
  }, [data, chartKey, plugins.fitContent]);

  useEffect(() => {
    if (!seriesRef.current) return;

    PriceLines(seriesRef, priceLinesRef, trades);
  }, [trades, chartKey]);

  useEffect(() => {
    if (!positions.length) return;

    const frame = requestAnimationFrame(() => {
      setOverlayVersion((version) => version + 1);
    });

    return () => cancelAnimationFrame(frame);
  }, [positions, data, chartKey]);

  useEffect(() => {
    if (!chartRef.current || !containerRef.current || !positions.length) return;

    const chart = chartRef.current;
    let frame: number | null = null;

    const invalidateOverlay = () => {
      if (frame != null) return;

      frame = requestAnimationFrame(() => {
        frame = null;
        setOverlayVersion((version) => version + 1);
      });
    };

    const observer = new ResizeObserver(invalidateOverlay);
    observer.observe(containerRef.current);

    chart.timeScale().subscribeVisibleLogicalRangeChange(invalidateOverlay);
    invalidateOverlay();

    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(invalidateOverlay);
    };
  }, [positions.length, chartKey]);

  useEffect(() => {
    if (!seriesRef.current) return;

    const active = new Set<string>();

    positions.forEach((position) => {
      const rawId = position.trade_id;
      if (rawId == null) return;

      const id = String(rawId);

      const entryPrice = Number(
        position.entry_price ?? position.entryPrice ?? position.price
      );

      if (!Number.isFinite(entryPrice)) return;

      const lines = [
        {
          key: `${id}:entry`,
          price: entryPrice,
          color: position.side === "short" ? DANGER : ACCENT,
          title:
            plugins.getPositionLabel?.(position) ??
            `${position.side?.toUpperCase?.() ?? ""} ${position.symbol ?? ""}`,
          lineStyle: 0,
        },
      ];

      if (position.stop_loss != null) {
        const stopLoss = Number(position.stop_loss);

        lines.push({
          key: `${id}:stop_loss`,
          price: stopLoss,
          color: DANGER,
          title: `SL ${stopLoss.toFixed(2)}`,
          lineStyle: 0,
        });
      }

      if (position.take_profit != null) {
        const takeProfit = Number(position.take_profit);

        lines.push({
          key: `${id}:take_profit`,
          price: takeProfit,
          color: SUCCESS,
          title: `TP ${takeProfit.toFixed(2)}`,
          lineStyle: 0,
        });
      }

      lines.forEach((lineConfig) => {
        if (!Number.isFinite(lineConfig.price)) return;

        active.add(lineConfig.key);

        const existing = positionLinesRef.current.get(lineConfig.key);

        if (existing) {
          existing.applyOptions({
            price: lineConfig.price,
            title: "",
            color: lineConfig.color,
            lineStyle: lineConfig.lineStyle,
            axisLabelVisible: true,
          });

          return;
        }

        const line = seriesRef.current.createPriceLine({
          price: lineConfig.price,
          color: lineConfig.color,
          lineWidth: 1,
          lineStyle: lineConfig.lineStyle,
          axisLabelVisible: true,
          title: "",
        });

        positionLinesRef.current.set(lineConfig.key, line);
      });
    });

    positionLinesRef.current.forEach((line, key) => {
      if (!active.has(key)) {
        seriesRef.current.removePriceLine(line);
        positionLinesRef.current.delete(key);
      }
    });
  }, [positions, plugins.getPositionLabel, chartKey]);

  useEffect(() => {
    if (!chartRef.current || !plugins.onScrollLeft) return;

    let timeout: ReturnType<typeof setTimeout>;
    let requestedForCurrentData = false;

    const handler = (range: any) => {
      clearTimeout(timeout);

      if (!range || range.from >= 0) {
        requestedForCurrentData = false;
        return;
      }

      if (requestedForCurrentData) return;

      timeout = setTimeout(() => {
        requestedForCurrentData = true;
        plugins.onScrollLeft?.();
      }, 120);
    };

    const timeScale = chartRef.current.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(handler);

    // Re-check after every historical data expansion. If the newly prepended
    // page still does not cover the visible range, request the next older one.
    handler(timeScale.getVisibleLogicalRange());

    return () => {
      clearTimeout(timeout);
      timeScale.unsubscribeVisibleLogicalRangeChange(handler);
    };
  }, [plugins.onScrollLeft, chartKey, data.length]);

  useScriptIndicators(
    chartRef,
    seriesRef,
    data,
    plugins.enableIndicators && !plugins.strategyTeaching ? plugins.appliedIndicators ?? [] : [],
    chartKey,
  );

  const validationCandidate = plugins.validation?.active
    ? plugins.validation.candidate
    : null;
  const semanticMarks = plugins.validation?.active && validationCandidate
    ? buildValidationMarks(validationCandidate, plugins.validation.semanticReferences)
    : plugins.semanticMarks ?? [];

  useEffect(() => {
    if (!validationCandidate?.candles.length || !chartRef.current) return;

    const candles = validationCandidate.candles;
    const from = candles[0].time;
    const to = candles[candles.length - 1].time;
    const span = Math.max(1, to - from);
    const candleSpan = span / Math.max(1, candles.length - 1);
    const padding = Math.max(span * 0.15, candleSpan * 2);

    chartRef.current.timeScale().setVisibleRange({
      from: from - padding,
      to: to + padding,
    });
  }, [validationCandidate, chartKey]);

  const { setSelection, clearSelection } = useCandleHighlight({
    chartRef,
    seriesRef,
    containerRef,
    data,
    active: Boolean(
      plugins.enableStrategyOverlay && plugins.isCreatingStrategy,
    ),
    validation: plugins.validation,
  });

  const chartElement = (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={containerRef}
        className="finsec-chart-surface"
        style={{ width: "100%", height: "100%" }}
      />

      {plugins.renderTradeUI && (
        <div
          style={{
            position: "absolute",
            top: 42,
            left: 10,
            zIndex: 10,
          }}
        >
          {plugins.renderTradeUI}
        </div>
      )}

      {plugins.enableStrategyOverlay &&
        (plugins.isCreatingStrategy || (plugins.validation?.active && plugins.validation.candidate !== null)) && (
        <StrategyOverlay
          chartRef={chartRef}
          seriesRef={seriesRef}
          data={data}
          onAnnotation={plugins.onAnnotation}
          setSelection={setSelection}
          clearSelection={clearSelection}
        />
      )}

      {semanticMarks.length > 0 && <SemanticMarksOverlay
        chartRef={chartRef}
        seriesRef={seriesRef}
        data={validationCandidate?.candles ?? data}
        marks={semanticMarks}
        compact={plugins.semanticMarksCompact}
      />}

      {plugins.strategyTeaching && <StrategyTeachingOverlay chartRef={chartRef} seriesRef={seriesRef} data={data} />}

      {!plugins.strategyTeaching && positions.length > 0 && (
        <PositionTags
          positions={positions}
          livePnLMap={plugins.livePnLMap ?? {}}
          seriesRef={seriesRef}
          renderVersion={overlayVersion}
          onClosePosition={plugins.onClosePosition}
          updatePosition={plugins.updatePosition}
        />
      )}
    </div>
  );

  return {
    containerRef,
    chartRef,
    seriesRef,
    chartElement,
  };
}
