import { useEffect } from 'react';
import { BaselineSeries, BaselineSeriesPartialOptions } from 'lightweight-charts';
import { useChart } from '../hooks/useChart';

export const PnLChart: React.FC<{ data: any[]; colors?: any }> = ({ data, colors = {} }) => {
  const {
    topLineColor    = '#26a69aff',
    bottomLineColor = '#ef5350ff',
    topFillColor1   = 'rgb(116,216,206)',
    bottomFillColor1 = 'rgba(241,144,142,0.2)',
    baselineValue   = 0,
  } = colors;

  const { containerRef, seriesRef } = useChart(BaselineSeries, {
    baseValue: { type: 'price', price: baselineValue },
    topLineColor, bottomLineColor, topFillColor1, bottomFillColor1,
    lineWidth: 1,
  } satisfies BaselineSeriesPartialOptions, {
    timeScale: { fixLeftEdge: true, rightOffset: -300 },
  });

  useEffect(() => {
    if (!seriesRef.current) return;
    // Map from PnLPoint { date, cumulative } → { time, value } expected by lightweight-charts
    const mapped = data
      .filter((p) => p?.date)
      .map((p) => ({ time: p.date as string, value: p.cumulative as number }));
    seriesRef.current.setData(mapped);
  }, [data]);

  return <div ref={containerRef} style={{ width: '100%', height: 200 }} />;
};
