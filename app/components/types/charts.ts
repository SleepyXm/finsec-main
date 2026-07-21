export type RawData = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  buy_price: number | null;
};

export type Candle = RawData;


export const CHART_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "1d"] as const;

export type Interval = (typeof CHART_INTERVALS)[number];

export type Period =
  | "1d"
  | "5d"
  | "1mo"
  | "3mo"
  | "6mo"
  | "1y"
  | "5y";
