import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, AreaSeries, BaselineSeries, BaselineSeriesPartialOptions } from 'lightweight-charts';
import { PriceLines } from '../components/trading/price';

export const CandleStickChart: React.FC<{
  data: any[];
  colors?: any;
  renderTradeUI?: React.ReactNode;
  trades?: any[];
}> = ({ data, colors = {}, renderTradeUI, trades = [] }) => {
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

  useEffect(() => {
    if (!chartContainerRef2.current) return;

    const chart = createChart(chartContainerRef2.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor,
      },
      width: chartContainerRef2.current.clientWidth,
      height: chartContainerRef2.current.clientHeight,
      timeScale: {
        rightOffset: 30,
        timeVisible: true,
        secondsVisible: false,
      },
      grid: 
        {
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

    const handleResize = () => {
      if (chartRef.current && chartContainerRef2.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef2.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
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
    <div style={{ position: 'relative', width: "90vw", height: "70vh" }}>
    <div ref={chartContainerRef2} style={{ width: '100%', height: '100%' }} />

    {renderTradeUI && (
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
        {renderTradeUI}
      </div>
    )}
  </div>
  );
};




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
      timeScale: {
        rightOffset: 30,
      },
      grid: 
        {
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
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
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

  return(
  <div style={{ position: 'relative', width: "90vw", height: "70vh" }}>
    <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
    {renderTradeUI && (
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
        {renderTradeUI}
      </div>
      )}
  </div>
  );
};



export const LinechartIntraday: React.FC<{
  data: any[];
  colors?: any;
}> = ({ data, colors = {} }) => {
  const {
    backgroundColor = 'transparent',
    textColor = 'black',
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
      timeScale: {
        fixLeftEdge: true,
      },
      grid: 
        {
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
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
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