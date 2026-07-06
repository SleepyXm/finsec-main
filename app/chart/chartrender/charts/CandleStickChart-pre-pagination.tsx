import { useEffect, useRef, useCallback } from 'react';
import { CandlestickSeries, ColorType } from 'lightweight-charts';
import { useChart } from '../hooks/useChart';
import { StrategyOverlay } from '../overlays/Strategy';
import { PriceLines } from '@/app/components/trading/price';
import { useCandleHighlight } from '@/app/chart/chartrender/overlays/CandleHighlight';
import { ChartTheme, defaultChartTheme } from '../themes/themes';
import { useIndicators } from '@/app/indicators/hooks/useIndicator';

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
  theme?: ChartTheme; 
}> = ({ data, colors = {}, renderTradeUI, trades = [], positions = [], livePnLMap = {}, isCreatingStrategy = false, onClosePosition, onAnnotation, theme = defaultChartTheme }) => {
  const priceLinesRef = useRef<any[]>([]);

  const getPositionLabel = useCallback((position: any) => {
    const id = position.trade_id;
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
      upColor: theme.bullCandle,
      downColor: theme.bearCandle,
      borderUpColor: theme.bullCandle,
      borderDownColor: theme.bearCandle,
      wickUpColor: theme.wickUpColor,
      wickDownColor: theme.wickDownColor,
    },
  
    {
      layout: {
        background: theme.background.type === 'solid'
          ? { type: ColorType.Solid, color: theme.background.color }
          : { type: ColorType.Solid, color: 'transparent' },
        textColor: theme.text,
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      crosshair: {
        vertLine: { color: theme.crosshair },
        horzLine: { color: theme.crosshair },
      },
    },
    {
      positions,

      getPositionLabel: (position) => {
        const id = position.trade_id;

        const pnl = livePnLMap[id] ?? 0;

        return (
          `${position.side.toUpperCase()} ` +
          `${position.symbol} ` +
          `${pnl >= 0 ? '+' : ''}` +
          `$${pnl.toFixed(2)}`
        );
      },
    },
    theme
  );

  useIndicators(chartRef, seriesRef, data, {
    series: {
      //sma: { enabled: true, period: 14 },
      //supertrend: { enabled: true, config: {
        //atrPeriod: 10, factor: 3,
        //trainingPeriod: 100,
        //highVolPercentile: 0.75,
        //midVolPercentile: 0.5,
        //lowVolPercentile: 0.25,
      //} }
    },
    zones: {
      //liquidityVoid: { enabled: true }
    }
  })

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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {renderTradeUI && <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>{renderTradeUI}</div>}
      {isCreatingStrategy && <StrategyOverlay chartRef={chartRef} seriesRef={seriesRef} data={data} onAnnotation={onAnnotation} setSelection={setSelection} clearSelection={clearSelection} />}
    </div>
  );
};
