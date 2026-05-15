export type ChartBackground =
  | { type: 'solid'; color: string }
  | { type: 'transparent' }
  | { type: 'gradient'; topColor: string; bottomColor: string };

export interface ChartTheme {
  background: ChartBackground;
  text: string;

  grid: string;

  bullCandle: string;
  bearCandle: string;

  longPosition: string;
  shortPosition: string;

  selectionOverlay: string;
  selectionBorder: string;

  crosshair: string;

  lineUp: string;
  lineDown: string;
  areaTopUp: string;
  areaTopDown: string;
  areaBottomUp: string;
  areaBottomDown: string;
}

export const defaultChartTheme: ChartTheme = {
  background: { type: 'transparent' },
  text: '#e8e8e8',

  grid: '#444',

  bullCandle: '#089981',
  bearCandle: '#f23645',

  longPosition: '#ffffff',
  shortPosition: '#000000',

  selectionOverlay: 'rgba(0, 0, 0, 0.45)',
  selectionBorder: '#2962ff',

  crosshair: '#2962ff',

  lineUp: '#26a69a',
  lineDown: '#ef5350',
  areaTopUp: 'rgba(38,166,154,0.2)',
  areaTopDown: 'rgba(239,83,80,0.2)',
  areaBottomUp: 'rgba(7,32,30,0.06)',
  areaBottomDown: 'rgba(54,19,19,0.06)',
};

export const intradayChartTheme: ChartTheme = {
  background: { type: 'transparent' },
  text: '#e8e8e8',

  grid: '#2a2e3a00',

  bullCandle: '#c2c2c2',
  bearCandle: '#000000',

  longPosition: '#ffffff',
  shortPosition: '#000000',

  selectionOverlay: 'rgba(0, 0, 0, 0.45)',
  selectionBorder: '#2962ff',

  crosshair: '#2962ff',

  lineUp: '#26a69a',
  lineDown: '#ef5350',
  areaTopUp: 'rgba(38,166,154,0.2)',
  areaTopDown: 'rgba(239,83,80,0.2)',
  areaBottomUp: 'rgba(7,32,30,0.06)',
  areaBottomDown: 'rgba(54,19,19,0.06)',
};



export const gradientChartTheme: ChartTheme = {
  background: { type: 'gradient', topColor: '#1d2129', bottomColor: '#0a0e14' },
  text: '#e8e8e8',

  grid: '#444',

  bullCandle: '#089981',
  bearCandle: '#f23645',

  longPosition: '#ffffff',
  shortPosition: '#000000',

  selectionOverlay: 'rgba(0, 0, 0, 0.45)',
  selectionBorder: '#2962ff',

  crosshair: '#2962ff',

  lineUp: '#26a69a',
  lineDown: '#ef5350',
  areaTopUp: 'rgba(38,166,154,0.2)',
  areaTopDown: 'rgba(239,83,80,0.2)',
  areaBottomUp: 'rgba(7,32,30,0.06)',
  areaBottomDown: 'rgba(54,19,19,0.06)',
};