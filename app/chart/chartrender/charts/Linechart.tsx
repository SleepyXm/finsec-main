import { useEffect } from 'react';
import { AreaSeries } from 'lightweight-charts';
import { useChart } from '../hooks/useChart';
import { PriceLines } from '@/app/components/trading/price';
import { useRef } from 'react';
import { ChartTheme } from '../themes/themes';

export const Linechart: React.FC<{
  data: any[];
  colors?: any;
  renderTradeUI?: React.ReactNode;
  trades?: any[];
  theme?: ChartTheme; 
}> = ({ data, colors = {}, renderTradeUI, trades = [] }) => {
  const { lineColor = '#2962FF', areaTopColor = '#2962FF', areaBottomColor = 'rgba(41,98,255,0.28)' } = colors;
  const priceLinesRef = useRef<any[]>([]);

  const { containerRef, seriesRef } = useChart(AreaSeries, {
    lineColor, topColor: areaTopColor, bottomColor: areaBottomColor,
  });

  useEffect(() => { PriceLines(seriesRef, priceLinesRef, trades); }, [trades, seriesRef.current]);
  useEffect(() => { if (seriesRef.current) seriesRef.current.setData(data); }, [data]);

  return (
    <div style={{ position: 'relative', width: '95vw', height: '70vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {renderTradeUI && <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>{renderTradeUI}</div>}
    </div>
  );
};