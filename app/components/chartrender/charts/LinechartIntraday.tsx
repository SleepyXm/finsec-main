import { useEffect } from 'react';
import { AreaSeries } from 'lightweight-charts';
import { useChart } from '../hooks/useChart';

export const LinechartIntraday: React.FC<{
  data: any[];
  colors?: any;
  minimal?: boolean;
}> = ({ data, colors = {}, minimal = false }) => {
  const { containerRef, seriesRef, chartRef } = useChart(AreaSeries, {
    lineColor: '#26a69a',
    topColor: 'rgba(38,166,154,0.2)',
    bottomColor: 'rgba(38,166,154,0.0)',
    lineWidth: 1,
    lastValueVisible: true,
    priceLineVisible: false,
  }, {
    timeScale: { fixLeftEdge: true, timeVisible: true, secondsVisible: false },
    gridColor: '#2a2e3a00',
    extra: {
      rightPriceScale: { visible: true },
      crosshair: { vertLine: { visible: true }, horzLine: { visible: !minimal } },
      handleScroll: !minimal,
      handleScale: !minimal,
    }
  });

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    const first = data[0]?.value ?? data[0]?.close ?? 0;
    const last = data[data.length - 1]?.value ?? data[data.length - 1]?.close ?? 0;
    const isUp = last >= first;
    seriesRef.current.applyOptions({
      lineColor: isUp ? '#26a69a' : '#ef5350',
      topColor: isUp ? 'rgba(38,166,154,0.2)' : 'rgba(239,83,80,0.2)',
      bottomColor: isUp ? 'rgba(7,32,30,0.06)' : 'rgba(54,19,19,0.06)',
    });
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={containerRef} style={{ width: '100%', height: '300px' }} />;
};