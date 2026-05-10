import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, AreaSeries, BaselineSeries, BaselineSeriesPartialOptions } from 'lightweight-charts';
import { PriceLines } from '../components/trading/price';

export const CandleStickChart: React.FC<{
  data: any[];
  colors?: any;
  renderTradeUI?: React.ReactNode;
  trades?: any[];
  positions?: any[];
  livePnLMap?: Record<string, number>;
  onClosePosition?: (id: string) => void;
}> = ({ data, colors = {}, renderTradeUI, trades = [], positions = [], livePnLMap = {}, onClosePosition }) => {
  const {
    backgroundColor = 'transparent',
    textColor = 'white',
    upColor = '#1fb369ff',
    downColor = '#ad4b44ff',
    borderUpColor = '#1fb369ff',
    borderDownColor = '#ad4b44ff',
    wickUpColor = '#1fb369ff',
    wickDownColor = '#ad4b44ff',
  } = colors;

  const chartContainerRef2 = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const positionLinesRef = useRef<any[]>([]);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!chartContainerRef2.current) return;

    const chart = createChart(chartContainerRef2.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor: "white",
      },
      width: chartContainerRef2.current.clientWidth,
      height: chartContainerRef2.current.clientHeight,
      timeScale: {
        rightOffset: 30,
        timeVisible: true,
        secondsVisible: false,
      },
      grid: {
        vertLines: { color: '#444' },
        horzLines: { color: '#444' },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor,
      downColor,
      borderUpColor,
      borderDownColor,
      wickUpColor,
      wickDownColor,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    series.setData(data);

    // Re-render tags on pan/zoom so Y coords stay in sync
    const handleVisibleRangeChange = () => forceUpdate(n => n + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange);

    const handleResize = () => {
      if (chartRef.current && chartContainerRef2.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef2.current.clientWidth,
        });
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
      priceLinesRef.current = [];
      positionLinesRef.current = [];
    };
  }, []);

  useEffect(() => {
    PriceLines(seriesRef, priceLinesRef, trades);
  }, [trades, seriesRef.current]);

  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setData(data);
    }
  }, [data]);

  // Sync position price lines on the series (the axis label + dashed line)
  useEffect(() => {
    if (!seriesRef.current) return;

    positionLinesRef.current.forEach(line => {
      try { seriesRef.current.removePriceLine(line); } catch {}
    });
    positionLinesRef.current = [];

    positions.forEach((position) => {
      const id = position.position_id ?? position.id;
      const livePnL = livePnLMap[id] ?? 0;
      const isLong = position.side === 'long';

      const line = seriesRef.current.createPriceLine({
        price: position.entry_price,
        color: isLong ? '#22c55e' : '#ef4444',
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `${position.side.toUpperCase()} ${position.symbol}  ${livePnL >= 0 ? '+' : ''}$${livePnL.toFixed(2)}`,
      });

      positionLinesRef.current.push(line);
    });
  }, [positions, livePnLMap]);

  // Compute HTML tag positions from price coords at render time
  const positionTags = positions.map((position) => {
    const id = position.position_id ?? position.id;
    const livePnL = livePnLMap[id] ?? 0;
    const isLong = position.side === 'long';
    const y = seriesRef.current?.priceToCoordinate(position.entry_price);
    return { id, position, livePnL, isLong, y };
  });

  return (
    <div style={{ position: 'relative', width: '90vw', height: '70vh' }}>
      <div ref={chartContainerRef2} style={{ width: '100%', height: '100%' }} />

      {/* Position entry line tags */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
        {positionTags.map(({ id, position, livePnL, isLong, y }) => {
          if (y == null || isNaN(y)) return null;
          const lineColor = isLong ? '#22c55e' : '#ef4444';
          const tagBg = isLong ? '#044720' : '#450a0a';
          const pnlColor = livePnL >= 0 ? '#4ade80' : '#f87171';

          return (
            <div
              key={id}
              style={{
                position: 'absolute',
                right: 60,
                top: y - 16,
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                background: tagBg,
                border: `1px solid ${lineColor}`,
                borderLeft: `3px solid ${lineColor}`,
                borderRadius: 3,
                padding: '2px 6px',
                gap: 8,
                minWidth: 130,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: lineColor, fontWeight: 600 }}>
                  {position.side.toUpperCase()} {position.symbol}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: pnlColor }}>
                  {livePnL >= 0 ? '+' : ''}${livePnL.toFixed(2)}
                </span>
              </div>
              {onClosePosition && (
                <button
                  onClick={() => onClosePosition(id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6b7280',
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '0 2px',
                    lineHeight: 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {renderTradeUI && (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
          {renderTradeUI}
        </div>
      )}
    </div>
  );
};


// --- Linechart and LinechartIntraday unchanged below ---

export const Linechart: React.FC<{data: any[]; colors?: any; renderTradeUI?: React.ReactNode; trades?: any[];}> = ({ data, colors = {}, renderTradeUI, trades = [] }) => {
  const {
    backgroundColor = 'transparent',
    textColor = 'black',
    lineColor = '#2962FF',
    areaTopColor = '#2962FF',
    areaBottomColor = 'rgba(41, 98, 255, 0.28)',
  } = colors;

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: { rightOffset: 30 },
      grid: {
        vertLines: { color: '#444' },
        horzLines: { color: '#444' },
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: areaTopColor,
      bottomColor: areaBottomColor,
    });

    series.setData(data);
    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    PriceLines(seriesRef, priceLinesRef, trades);
  }, [trades, seriesRef.current]);

  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setData(data);
    }
  }, [data]);

  return (
    <div style={{ position: 'relative', width: '90vw', height: '70vh' }}>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
      {renderTradeUI && (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
          {renderTradeUI}
        </div>
      )}
    </div>
  );
};






{/* -----------------Intraday Chart----------------- */}
export const LinechartIntraday: React.FC<{
  data: any[];
  colors?: any;
  minimal?: boolean;
}> = ({ data, colors = {}, minimal = false }) => {
  const {
    backgroundColor = 'transparent',
    textColor = '#ffffff',
  } = colors;

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        fixLeftEdge: true,
        visible: true,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: { visible: true },
      grid: {
        vertLines: { color: '#2a2e3a', visible: !minimal },
        horzLines: { color: '#2a2e3a', visible: !minimal },
      },
      crosshair: {
        vertLine: { visible: !minimal },
        horzLine: { visible: !minimal },
      },
      handleScroll: !minimal,
      handleScale: !minimal,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#26a69a',
      topColor: 'rgba(38, 166, 154, 0.2)',
      bottomColor: 'rgba(38, 166, 154, 0.0)',
      lineWidth: 1,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    const first = data[0]?.value ?? data[0]?.close ?? 0;
    const last = data[data.length - 1]?.value ?? data[data.length - 1]?.close ?? 0;
    const isUp = last >= first;
    seriesRef.current.applyOptions({
      lineColor: isUp ? '#26a69a' : '#ef5350',
      topColor: isUp ? 'rgba(38, 166, 154, 0.2)' : 'rgba(239, 83, 80, 0.2)',
      bottomColor: 'rgba(0, 0, 0, 0.0)',
    });
    seriesRef.current.setData(data);
  }, [data]);

  return <div ref={chartContainerRef} style={{ width: '100%', height: '300px' }} />;
};


{/* -----------------PnL Chart----------------- */}

export const PnLChart: React.FC<{
  data: any[];
  colors?: any;
}> = ({ data, colors = {} }) => {
  const {
    backgroundColor = 'transparent',
    textColor = 'white',
    topLineColor = '#4deb82ff',
    bottomLineColor = '#ff4d4d',
    topFillColor1 = '#29ff70ff',
    bottomFillColor1 = 'rgba(255, 0, 0, 0.2)',
    baselineValue = 0,
  } = colors;

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: { fixLeftEdge: true },
      grid: {
        vertLines: { color: '#444' },
        horzLines: { color: '#444' },
      },
    });

    const series = chart.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: baselineValue },
      topLineColor,
      bottomLineColor,
      topFillColor1,
      bottomFillColor1,
      lineWidth: 2,
    } satisfies BaselineSeriesPartialOptions);

    series.setData(data);
    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setData(data);
    }
  }, [data]);

  return <div ref={chartContainerRef} style={{ width: 600, height: 200 }} />;
};