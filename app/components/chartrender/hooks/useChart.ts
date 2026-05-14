import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import positions from '../../trading/positions';

type ChartPlugins = {
  positions?: any[];
  getPositionLabel?: (position: any) => string;
};

export function useChart(seriesConstructor: any, seriesOptions: any = {}, chartOptions: any = {}, plugins: ChartPlugins = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const positionLinesRef = useRef<Map<string, any>>(new Map());
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
        layout: {
            background: { type: ColorType.Solid, color: chartOptions.backgroundColor ?? 'transparent' },
            textColor: chartOptions.textColor ?? 'white',
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
            fixLeftEdge: false,
            fixRightEdge: false,
            ...chartOptions.timeScale,
        },
        grid: {
            vertLines: { color: chartOptions.gridColor ?? '#444' },
            horzLines: { color: chartOptions.gridColor ?? '#444' },
        },
        ...chartOptions.extra,
    });

    const series = chart.addSeries(seriesConstructor, seriesOptions);
    chartRef.current = chart;
    seriesRef.current = series;

    const handleVisibleRangeChange = () => forceUpdate(n => n + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange);

    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
        forceUpdate(n => n + 1);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);


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
}, [plugins.positions, plugins.getPositionLabel]);

  return { containerRef, chartRef, seriesRef };
}