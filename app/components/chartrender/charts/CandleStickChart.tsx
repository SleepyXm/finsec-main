import { useEffect, useRef } from 'react';
import { CandlestickSeries } from 'lightweight-charts';
import { useChart } from '../hooks/useChart';
import { PositionTags } from '../overlays/PositionOverlay';
import { StrategyOverlay } from '../overlays/Strategy';
import { PriceLines } from '../../trading/price';

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
  const positionLinesRef = useRef<any[]>([]);

  const { containerRef, chartRef, seriesRef } = useChart(CandlestickSeries, {
    upColor, downColor,
    borderUpColor: upColor, borderDownColor: downColor,
    wickUpColor: upColor, wickDownColor: downColor,
  });

  useEffect(() => { PriceLines(seriesRef, priceLinesRef, trades); }, [trades, seriesRef.current]);
  useEffect(() => { if (seriesRef.current) seriesRef.current.setData(data); }, [data]);

  useEffect(() => {
    if (!seriesRef.current) return;
    positionLinesRef.current.forEach(line => { try { seriesRef.current.removePriceLine(line); } catch {} });
    positionLinesRef.current = [];
    positions.forEach((position) => {
      const id = position.position_id ?? position.id;
      const livePnL = livePnLMap[id] ?? 0;
      const isLong = position.side === 'long';
      const line = seriesRef.current.createPriceLine({
        price: position.entry_price,
        color: isLong ? '#22c55e' : '#ef4444',
        lineWidth: 1, lineStyle: 2, axisLabelVisible: true,
        title: `${position.side.toUpperCase()} ${position.symbol} ${livePnL >= 0 ? '+' : ''}$${livePnL.toFixed(2)}`,
      });
      positionLinesRef.current.push(line);
    });
  }, [positions, livePnLMap]);

  return (
    <div style={{ position: 'relative', width: '90vw', height: '70vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <PositionTags positions={positions} livePnLMap={livePnLMap} seriesRef={seriesRef} onClosePosition={onClosePosition} />
      {renderTradeUI && <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>{renderTradeUI}</div>}
      {isCreatingStrategy && <StrategyOverlay chartRef={chartRef} seriesRef={seriesRef} data={data} onAnnotation={onAnnotation} />}
    </div>
  );
};