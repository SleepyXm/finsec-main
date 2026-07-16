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


export type Interval = 
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "4h"
  | "1d"
  | "1wk"
  | "1mo";

export type Period =
  | "1d"
  | "5d"
  | "1mo"
  | "3mo"
  | "6mo"
  | "1y"
  | "5y";
