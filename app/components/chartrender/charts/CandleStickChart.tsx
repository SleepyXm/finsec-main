import { useEffect, useRef, useCallback } from 'react';
import { CandlestickSeries } from 'lightweight-charts';
import { useChart } from '../hooks/useChart';
import { StrategyOverlay } from '../overlays/Strategy';
import { PriceLines } from '../../trading/price';
import { useCandleHighlight } from '../overlays/CandleHighlight';

export const CandleStickChart: React.FC<{
  data: any[];
  colors?: any;
  renderTradeUI?: React.ReactNode;
  trades?: any[];
  positions?: any[];
  livePnLMap?: Record<string, number>;
  isCreatingStrategy?: boolean;
  onClosePosition?: (id: string) => void;
  onAnnotation?: (annotation: any) => void;
}> = ({ data, colors = {}, renderTradeUI, trades = [], positions = [], livePnLMap = {}, isCreatingStrategy = false, onClosePosition, onAnnotation }) => {
  const { upColor = 'rgb(69,197,133)', downColor = '#ad4b44ff' } = colors;
  const priceLinesRef = useRef<any[]>([]);

  const getPositionLabel = useCallback((position: any) => {
  const id = position.position_id ?? position.id;
  const pnl = livePnLMap[id] ?? 0;

  return (
    `${position.side.toUpperCase()} ` +
    `${position.symbol} ` +
    `${pnl >= 0 ? '+' : ''}` +
    `$${pnl.toFixed(2)}`
  );
}, [livePnLMap]);

  const { containerRef, chartRef, seriesRef } = useChart(
  CandlestickSeries,
  {
    upColor,
    downColor,
    borderUpColor: upColor,
    borderDownColor: downColor,
    wickUpColor: upColor,
    wickDownColor: downColor,getPositionLabel,
  },
  {},
  {
    positions,

    getPositionLabel: (position) => {
      const id =
        position.position_id ?? position.id;

      const pnl = livePnLMap[id] ?? 0;

      return (
        `${position.side.toUpperCase()} ` +
        `${position.symbol} ` +
        `${pnl >= 0 ? '+' : ''}` +
        `$${pnl.toFixed(2)}`
      );
    },
  }
);

  const { setSelection, clearSelection } = useCandleHighlight({
    chartRef,
    seriesRef,
    containerRef,
    data,
    active: isCreatingStrategy,
});

  useEffect(() => { PriceLines(seriesRef, priceLinesRef, trades); }, [trades, seriesRef.current]);
  useEffect(() => {
  if (!seriesRef.current || !chartRef.current || data.length < 2) return;

  const interval = data[1].time - data[0].time;
  const barSpacing = chartRef.current.timeScale().options().barSpacing;
  const containerWidth = containerRef.current?.clientWidth ?? 0;
  const lastCandle = data[data.length - 1];
  
  const visibleBars = Math.ceil(containerWidth / barSpacing);
  
  const whitespace = [];
  for (let i = 1; i <= visibleBars; i++) {
    whitespace.push({ time: lastCandle.time + interval * i });
  }

  seriesRef.current.setData([...data, ...whitespace]);
}, [data]);


  return (
    <div style={{ position: 'relative', width: '97vw', height: '70vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {renderTradeUI && <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>{renderTradeUI}</div>}
      {isCreatingStrategy && <StrategyOverlay chartRef={chartRef} seriesRef={seriesRef} data={data} onAnnotation={onAnnotation} setSelection={setSelection} clearSelection={clearSelection} />}
    </div>
  );
};