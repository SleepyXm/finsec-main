import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
import positions from '@/app/components/trading/positions';
import { defaultChartTheme, ChartBackground } from '../themes/themes';

type ChartPlugins = {
  positions?: any[];
  getPositionLabel?: (position: any) => string;
};

export function resolveBackground(bg: ChartBackground) {
  switch (bg.type) {
    case 'solid':
      return { type: 'solid', color: bg.color };
    case 'gradient':
      return { type: 'gradient', topColor: bg.topColor, bottomColor: bg.bottomColor };
    case 'transparent':
    default:
      return { type: 'solid', color: 'transparent' };
  }
}

export function useChart(seriesConstructor: any, seriesOptions: any = {}, chartOptions: any = {}, plugins: ChartPlugins = {}, theme = defaultChartTheme,) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const positionLinesRef = useRef<Map<string, any>>(new Map());
  const [, forceUpdate] = useState(0);
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
      },

      ...chartOptions.extra,
    });

    const series = chart.addSeries(seriesConstructor, {
      ...seriesOptions,

      upColor: theme.bullCandle,
      downColor: theme.bearCandle,
      borderUpColor: theme.bullCandle,
      borderDownColor: theme.bearCandle,
      wickUpColor: theme.wickUpColor,
      wickDownColor: theme.wickDownColor,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    setChartKey(k => k + 1);

    const observer = new ResizeObserver(() => {
  if (!containerRef.current || !chartRef.current) return;
  chartRef.current.applyOptions({
    width: containerRef.current.clientWidth,
  });
  forceUpdate(n => n + 1);
});

observer.observe(containerRef.current);

return () => {
  observer.disconnect();
  chart.remove();
  chartRef.current = null;
  seriesRef.current = null;
  positionLinesRef.current.clear();
};
  }, []);

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
    });

    seriesRef.current.applyOptions({
      upColor: theme.bullCandle,
      downColor: theme.bearCandle,
      borderUpColor: theme.borderUpColor,
      borderDownColor: theme.borderDownColor,
      wickUpColor: theme.wickUpColor,
      wickDownColor: theme.wickDownColor,
    });
  }, [theme, chartKey]);


  useEffect(() => {
  if (!seriesRef.current || !plugins.positions) return;

  const active = new Set();

  plugins.positions.forEach((position) => {
    const id = position.position_id ?? position.id;

    active.add(id);

    const existing = positionLinesRef.current.get(id);

    const color =
      position.side === 'long'
        ? '#089981'
        : '#f23645';

    const title =
      plugins.getPositionLabel?.(position)
      ?? position.symbol;

    if (existing) {
      existing.applyOptions({
        price: position.entry_price,
        title,
        color,
      });

      return;
    }

    const line = seriesRef.current.createPriceLine({
      price: position.entry_price,
      color,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title,
    });

    positionLinesRef.current.set(id, line);
  });

  positionLinesRef.current.forEach((line, id) => {
    if (!active.has(id)) {
      seriesRef.current.removePriceLine(line);
      positionLinesRef.current.delete(id);
    }
  });
}, [chartKey, plugins.positions, plugins.getPositionLabel]);

  return { containerRef, chartRef, seriesRef };
}