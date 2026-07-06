import React, { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode } from "lightweight-charts";
import {
  defaultChartTheme,
  ChartBackground,
  ChartTheme,
} from "../themes/themes";
import { PriceLines } from "@/app/components/trading/price";
import { StrategyOverlay } from "../overlays/Strategy";
import { useCandleHighlight } from "@/app/chart/chartrender/overlays/CandleHighlight";
import { useIndicators } from "@/app/indicators/hooks/useIndicator";
import { PositionTags } from "@/app/chart/chartrender/overlays/PositionOverlay";

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

  getPositionLabel?: (position: any) => string;
  onClosePosition?: (id: string) => void;
  updatePosition?: (id: string, patch: any) => void;
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

    if (!chartRef.current || !containerRef.current || data.length < 2) {
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
  }, [data, chartKey]);

  useEffect(() => {
    if (!seriesRef.current) return;

    PriceLines(seriesRef, priceLinesRef, trades);
  }, [trades, chartKey]);

 useEffect(() => {
  if (!seriesRef.current) return;

  const active = new Set<string>();

  positions.forEach((position) => {
    const rawId = position.position_id ?? position.id;
    if (rawId == null) return;

    const id = String(rawId);

    const entryPrice = Number(
      position.entry_price ?? position.entryPrice ?? position.price
    );

    if (!Number.isFinite(entryPrice)) return;

    const isLong = position.side === "long";

    const defaultOffset = Math.max(Math.abs(entryPrice) * 0.01, 0.01);

    const stopLoss =
      position.stop_loss == null
        ? isLong
          ? entryPrice - defaultOffset
          : entryPrice + defaultOffset
        : Number(position.stop_loss);

    const takeProfit =
      position.take_profit == null
        ? isLong
          ? entryPrice + defaultOffset
          : entryPrice - defaultOffset
        : Number(position.take_profit);

    const sideColor = isLong ? "#089981" : "#f23645";

    const lines = [
      {
        key: `${id}:entry`,
        price: entryPrice,
        color: sideColor,
        title:
          plugins.getPositionLabel?.(position) ??
          `${position.side?.toUpperCase?.() ?? ""} ${position.symbol ?? ""}`,
        lineStyle: 2,
      },
      {
        key: `${id}:stop_loss`,
        price: stopLoss,
        color: "#f23645",
        title:
          position.stop_loss == null
            ? `SL ${stopLoss.toFixed(2)} PREVIEW`
            : `SL ${stopLoss.toFixed(2)}`,
        lineStyle: 1,
      },
      {
        key: `${id}:take_profit`,
        price: takeProfit,
        color: "#089981",
        title:
          position.take_profit == null
            ? `TP ${takeProfit.toFixed(2)} PREVIEW`
            : `TP ${takeProfit.toFixed(2)}`,
        lineStyle: 1,
      },
    ];

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
  axisLabelVisible: false,
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
    let fired = false;

    const handler = (range: any) => {
      if (!range) return;

      if (range.from < 10) {
        if (fired) return;

        clearTimeout(timeout);

        timeout = setTimeout(() => {
          fired = true;
          plugins.onScrollLeft?.();

          setTimeout(() => {
            fired = false;
          }, 2000);
        }, 200);

        return;
      }

      clearTimeout(timeout);
      fired = false;
    };

    chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(handler);

    return () => {
      clearTimeout(timeout);
      chartRef.current
        ?.timeScale()
        .unsubscribeVisibleLogicalRangeChange(handler);
    };
  }, [plugins.onScrollLeft, chartKey]);

  useIndicators(
    chartRef,
    seriesRef,
    data,
    plugins.enableIndicators
      ? {
          series: {},
          zones: {},
        }
      : {
          series: {},
          zones: {},
        },
  );

  const { setSelection, clearSelection } = useCandleHighlight({
    chartRef,
    seriesRef,
    containerRef,
    data,
    active: Boolean(
      plugins.enableStrategyOverlay && plugins.isCreatingStrategy,
    ),
  });

  const chartElement = (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {plugins.renderTradeUI && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 10,
          }}
        >
          {plugins.renderTradeUI}
        </div>
      )}

      {plugins.enableStrategyOverlay && plugins.isCreatingStrategy && (
        <StrategyOverlay
          chartRef={chartRef}
          seriesRef={seriesRef}
          data={data}
          onAnnotation={plugins.onAnnotation}
          setSelection={setSelection}
          clearSelection={clearSelection}
        />
      )}

      {positions.length > 0 && (
        <PositionTags
          positions={positions}
          livePnLMap={plugins.livePnLMap ?? {}}
          seriesRef={seriesRef}
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
