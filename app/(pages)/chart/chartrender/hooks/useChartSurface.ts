import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  type ChartOptions,
  type CrosshairOptions,
  type DeepPartial,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesDefinition,
  type SeriesPartialOptionsMap,
  type SeriesType,
  type TimeScaleOptions,
} from "lightweight-charts";
import type { ChartBackground, ChartTheme } from "../themes/themes";

export type ChartSurfaceOptions = {
  timeScale?: DeepPartial<TimeScaleOptions>;
  crosshair?: DeepPartial<CrosshairOptions>;
  extra?: DeepPartial<ChartOptions>;
};

function resolveBackground(background: ChartBackground) {
  if (background.type === "gradient") {
    return {
      type: ColorType.VerticalGradient,
      topColor: background.topColor,
      bottomColor: background.bottomColor,
    } as const;
  }
  return {
    type: ColorType.Solid,
    color: background.type === "solid" ? background.color : "transparent",
  } as const;
}

export function useChartSurface<T extends SeriesType>(
  seriesDefinition: SeriesDefinition<T>,
  seriesOptions: SeriesPartialOptionsMap[T],
  chartOptions: ChartSurfaceOptions,
  theme: ChartTheme,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<T> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const positionLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const [chartKey, setChartKey] = useState(0);

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
    const series = chart.addSeries(seriesDefinition, seriesOptions);
    chartRef.current = chart;
    seriesRef.current = series;
    const chartKeyFrame = requestAnimationFrame(() => {
      setChartKey((key) => key + 1);
    });

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
      cancelAnimationFrame(chartKeyFrame);
      priceLinesRef.current = [];
      positionLinesRef.current.clear();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [seriesDefinition]);

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

  return {
    containerRef,
    chartRef,
    seriesRef,
    priceLinesRef,
    positionLinesRef,
    chartKey,
  };
}
