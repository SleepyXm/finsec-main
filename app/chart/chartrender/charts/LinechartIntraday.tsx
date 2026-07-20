import { useEffect, useMemo } from 'react';
import { AreaSeries } from 'lightweight-charts';
import { useChart } from '../hooks/useChart';
import { intradayChartTheme, ChartTheme } from '../themes/themes';
import { IntradayLinePoint } from '@/app/types/assets';

export const LinechartIntraday: React.FC<{
  data: IntradayLinePoint[];
  colors?: unknown;
  minimal?: boolean;
  theme?: ChartTheme;
}> = ({ data, minimal = false, theme = intradayChartTheme }) => {
  
  // ✅ Normalize to { time, value } — AreaSeries requires `value`, not `close`
  const lineData = useMemo(() => {
    return data
      .filter((item) => item?.time != null)
      .map((item) => ({
        time: item.time,
        value: Number(item.value ?? item.close),
      }))
      .filter((item) => Number.isFinite(item.value));
  }, [data]);

  const first = lineData[0]?.value ?? 0;
  const last = lineData[lineData.length - 1]?.value ?? 0;
  const isUp = last >= first;

  const seriesOptions = useMemo(() => ({
    lineColor: isUp ? theme.lineUp : theme.lineDown,
    topColor: isUp ? theme.areaTopUp : theme.areaTopDown,
    bottomColor: isUp ? theme.areaBottomUp : theme.areaBottomDown,
    lineWidth: 1,
    lastValueVisible: true,
    priceLineVisible: false,
  }), [isUp, theme]);

  const chartOptions = useMemo(() => ({
    // ✅ crosshair is top-level, not inside `extra`
    crosshair: {
      vertLine: { visible: true },
      horzLine: { visible: !minimal },
    },
    timeScale: { fixLeftEdge: true, timeVisible: true, secondsVisible: false },
    extra: {
      rightPriceScale: { visible: true },
      handleScroll: !minimal,
      handleScale: !minimal,
    },
  }), [minimal]);

  // ✅ Pass lineData through plugins.data so useChart's effect owns it
  const { chartElement, chartRef } = useChart(
    AreaSeries,
    seriesOptions,
    chartOptions,
    { data: lineData },
    theme
  );

  useEffect(() => {
    if (!chartRef.current || lineData.length === 0) return;
    chartRef.current.timeScale().fitContent();
  }, [chartRef, lineData.length]);

  return (
    <div style={{ width: '100%', height: minimal ? '100%' : '300px' }}>
      {chartElement}
    </div>
  );
};
