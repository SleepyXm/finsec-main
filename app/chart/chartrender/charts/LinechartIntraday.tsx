import { useEffect } from 'react';
import { AreaSeries } from 'lightweight-charts';
import { useChart } from '../hooks/useChart';
import { intradayChartTheme, type ChartTheme } from '../themes/themes';

export const LinechartIntraday: React.FC<{
  data: any[];
  colors?: any;
  minimal?: boolean;
  theme?: ChartTheme;
}> = ({ data, colors = {}, minimal = false, theme = intradayChartTheme }) => {
  const { containerRef, seriesRef, chartRef } = useChart(AreaSeries, {
    lineColor: theme.lineUp,
    topColor: theme.areaTopUp,
    bottomColor: theme.areaBottomUp,
    text: theme.text,
    lineWidth: 1,
    lastValueVisible: true,
    priceLineVisible: false,
  }, {
    timeScale: { fixLeftEdge: true, timeVisible: true, secondsVisible: false },
    extra: {
      rightPriceScale: { visible: true },
      crosshair: { vertLine: { visible: true }, horzLine: { visible: !minimal } },
      handleScroll: !minimal,
      handleScale: !minimal,
    }
  }, {}, theme);

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    const first = data[0]?.value ?? data[0]?.close ?? 0;
    const last = data[data.length - 1]?.value ?? data[data.length - 1]?.close ?? 0;
    const isUp = last >= first;

    seriesRef.current.applyOptions({
      lineColor: isUp ? theme.lineUp : theme.lineDown,
      topColor: isUp ? theme.areaTopUp : theme.areaTopDown,
      bottomColor: isUp ? theme.areaBottomUp : theme.areaBottomDown,
    });

    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={containerRef} style={{ width: '100%', height: '300px' }} />;
};