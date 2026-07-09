import { useEffect, useState } from "react";
import { MarketOverviewItem, fetchMarketOverview } from "../../types/assets";
import { MarketSection } from "./MarketSection";

const TABS = [
  { label: "Popular",     tickers: [{ ticker: "ES=F", name: "S&P 500" }, { ticker: "BTC-USD", name: "Bitcoin" }, { ticker: "NQ=F", name: "Nasdaq 100" }, { ticker: "GBPUSD=X", name: "GBP/USD" }] },
  { label: "Indices",     tickers: [{ ticker: "ES=F", name: "S&P 500" }, { ticker: "NQ=F", name: "Nasdaq 100" }, { ticker: "^FTSE", name: "FTSE 100" }] },
  { label: "Futures",     tickers: [{ ticker: "NQ=F", name: "Nasdaq 100" }, { ticker: "GC=F", name: "Gold" }, { ticker: "SI=F", name: "Silver" }, { ticker: "MNQ=F", name: "Micro Nasdaq" }] },
  { label: "Stocks",      tickers: [{ ticker: "AAPL", name: "Apple" }, { ticker: "GOOGL", name: "Google" }, { ticker: "META", name: "Meta" }, { ticker: "NVDA", name: "NVIDIA" }, { ticker: "TSLA", name: "Tesla" }, { ticker: "MSFT", name: "Microsoft" }, { ticker: "AMZN", name: "Amazon" }] },
  { label: "Crypto",      tickers: [{ ticker: "BTC-USD", name: "Bitcoin" }, { ticker: "ETH-USD", name: "Ethereum" }, { ticker: "SOL-USD", name: "Solana" }, { ticker: "BNB-USD", name: "BNB" }] },
  { label: "Forex",       tickers: [{ ticker: "GBPUSD=X", name: "GBP/USD" }, { ticker: "EURUSD=X", name: "EUR/USD" }, { ticker: "JPY=X", name: "USD/JPY" }, { ticker: "AUDUSD=X", name: "AUD/USD" }] },
  { label: "Commodities", tickers: [{ ticker: "GC=F", name: "Gold" }, { ticker: "CL=F", name: "Crude Oil" }, { ticker: "SI=F", name: "Silver" }, { ticker: "NG=F", name: "Natural Gas" }] },
];

export default function MarketOverview() {
  const [items, setItems] = useState<MarketOverviewItem[]>([]);

  const merged = TABS.map(tab => ({
    ...tab,
    tickers: tab.tickers.map(t => {
      const live = items.find(i => i.ticker === t.ticker);
      return { ...t, close: live?.close ?? 0 };
    })
  }));

  useEffect(() => {
    fetchMarketOverview().then(setItems).catch(console.error);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1920px]">
      {merged.filter(tab => tab.label !== "Popular").map(tab => (
        <MarketSection key={tab.label} title={tab.label} items={tab.tickers} />
      ))}
    </div>
  );
}
