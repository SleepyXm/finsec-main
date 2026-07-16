import type { RawData } from "./charts";

const BACKEND_URL = "http://localhost:8000/api";

export interface Asset {
    symbol: string;
    shortname?: string;
    longname?: string;
    exchange?: string;
    quoteType?: string;
    [key: string]: any;
}

export type MarketOverviewItem = RawData & {
  ticker: string;
};
export interface SearchData {
  ticker: string,
  name: string,
}

export async function fetchAssets(query: string): Promise<Asset[]> {
  const res = await fetch(`${BACKEND_URL}/search?q=${query}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();
  return data.quotes ?? [];
}

export async function fetchIntraday(
  symbol: string,
  interval = "1m",
  period = "1d"
): Promise<Array<{ time: string | number; value: number }>> {
  const res = await fetch(
    `${BACKEND_URL}/stockdata/intraday?ticker_symbol=${symbol}&interval=${interval}&period=${period}`
  );
  if (!res.ok) throw new Error(`Intraday fetch failed for ${symbol}`);
  const data = await res.json();
  return data.map((d: any) => ({ time: d.time, value: d.close }));
}

export async function fetchMarketOverview(): Promise<MarketOverviewItem[]> {
  const res = await fetch(`${BACKEND_URL}/market/overview`);
  if (!res.ok) throw new Error(`Market overview failed: ${res.status}`);
  const items = await res.json() as MarketOverviewItem[];
  return items.map((item) => ({
    ...item,
    volume: item.volume ?? null,
    buy_price: item.buy_price ?? null,
  }));
}
