export interface ChartTheme {
  background: string;
  text: string;

  grid: string;

  bullCandle: string;
  bearCandle: string;

  longPosition: string;
  shortPosition: string;

  selectionOverlay: string;
  selectionBorder: string;

  crosshair: string;
}




export const defaultChartTheme: ChartTheme = {
  background: '#1e2d40',
  text: 'white',

  grid: '#444',

  bullCandle: '#c2c2c2',
  bearCandle: '#000000',

  longPosition: '#ffffff',
  shortPosition: '#000000',

  selectionOverlay: 'rgba(0, 0, 0, 0.45)',
  selectionBorder: '#2962ff',

  crosshair: '#2962ff',
};


export const intradayChartTheme: ChartTheme = {
  background: '#1e2d4000',
  text: 'white',

  grid: '#444',

  bullCandle: '#c2c2c2',
  bearCandle: '#000000',

  longPosition: '#ffffff',
  shortPosition: '#000000',

  selectionOverlay: 'rgba(0, 0, 0, 0.45)',
  selectionBorder: '#2962ff',

  crosshair: '#2962ff',
};