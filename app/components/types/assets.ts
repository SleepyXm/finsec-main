import { RawData } from "./charts";

const BACKEND_URL = "http://localhost:8000/api";
const INTRADAY_CACHE_MS = 30_000;

type IntradayCacheEntry = {
  expiresAt: number;
  data: IntradayLinePoint[];
};

const intradayCache = new Map<string, IntradayCacheEntry>();
const intradayRequests = new Map<string, Promise<IntradayLinePoint[]>>();

export interface Asset {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
}

export type MarketOverviewItem = RawData & {
  ticker: string;
};

export type IntradayLinePoint = {
  time: string | number;
  value?: number | null;
  close?: number | null;
};
export async function fetchAssets(query: string): Promise<Asset[]> {
  const res = await fetch(`${BACKEND_URL}/search?q=${query}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();
  return data.quotes ?? [];
}

export async function fetchIntraday(
  symbol: string,
  interval = "1m",
): Promise<IntradayLinePoint[]> {
  const ticker = symbol.trim().toUpperCase();
  const key = `${ticker}:${interval}`;
  const cached = intradayCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const pending = intradayRequests.get(key);
  if (pending) return pending;

  const request = fetch(
    `${BACKEND_URL}/stockdata/intraday?ticker_symbol=${ticker}&interval=${interval}`,
  )
    .then(async (response) => {
      if (!response.ok) throw new Error(`Intraday fetch failed for ${ticker}`);
      const data = await response.json() as Array<Pick<IntradayLinePoint, "time" | "close">>;
      const points = data
        .filter((point) => (typeof point.time === "string" || typeof point.time === "number")
          && typeof point.close === "number" && Number.isFinite(point.close))
        .map((point) => ({ time: point.time, value: point.close }));
      intradayCache.set(key, { data: points, expiresAt: Date.now() + INTRADAY_CACHE_MS });
      return points;
    })
    .finally(() => intradayRequests.delete(key));

  intradayRequests.set(key, request);
  return request;
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
