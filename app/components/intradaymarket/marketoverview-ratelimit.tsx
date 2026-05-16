import { useEffect, useState } from "react";
import Link from "next/link";
import { MarketOverviewItem } from "../../types/assets";
import { RawData } from "../../types/charts";
import { LinechartIntraday } from "../chartrender/charts/LinechartIntraday";
import { fetchMarketOverview, fetchIntraday } from "../../types/assets";
import { MarketSection } from "./MarketSection";
import { connectMarketOverview } from "@/app/types/websocket";

const TABS = [
  { label: "Popular",     tickers: [{ ticker: "ES=F", name: "S&P 500" }, { ticker: "BTC-USD", name: "Bitcoin" }, { ticker: "NQ=F", name: "Nasdaq 100" }, { ticker: "GBPUSD=X", name: "GBP/USD" }] },
  { label: "Indices",     tickers: [{ ticker: "ES=F", name: "S&P 500" }, { ticker: "NQ=F", name: "Nasdaq 100" }, { ticker: "^FTSE", name: "FTSE 100" }] },
  { label: "Futures",     tickers: [{ ticker: "NQ=F", name: "Nasdaq 100" }, { ticker: "GC=F", name: "Gold" }, { ticker: "SI=F", name: "Silver" }, { ticker: "MNQ=F", name: "Micro Nasdaq" }] },
  { label: "Crypto",      tickers: [{ ticker: "BTC-USD", name: "Bitcoin" }, { ticker: "ETH-USD", name: "Ethereum" }, { ticker: "SOL-USD", name: "Solana" }, { ticker: "BNB-USD", name: "BNB" }] },
  { label: "Forex",       tickers: [{ ticker: "GBPUSD=X", name: "GBP/USD" }, { ticker: "EURUSD=X", name: "EUR/USD" }, { ticker: "JPY=X", name: "USD/JPY" }, { ticker: "AUDUSD=X", name: "AUD/USD" }] },
  { label: "Commodities", tickers: [{ ticker: "GC=F", name: "Gold" }, { ticker: "CL=F", name: "Crude Oil" }, { ticker: "SI=F", name: "Silver" }, { ticker: "NG=F", name: "Natural Gas" }] },
];



function OverviewCard({ item }: { item: MarketOverviewItem }) {
  const [chartData, setChartData] = useState<RawData[]>([]);
  useEffect(() => {
    fetchIntraday(item.ticker).then(setChartData).catch(console.error);
  }, [item.ticker]);
  return (
    <Link href={`/chart/${item.ticker}`}>
      <div className="p-4 rounded-lg border border-gray-700 bg-[#1a1f2e] hover:border-blue-500 transition cursor-pointer">
        <div className="text-sm font-semibold text-white mb-2">{item.ticker}</div>
        {chartData.length > 0 && (
          <div className="fixed w-full h-[200px] scale-y-[0.4] origin-top">
            <LinechartIntraday data={chartData} minimal />
          </div>
        )}
      </div>
    </Link>
  );
}

export default function MarketOverview() {
  const [items, setItems] = useState<MarketOverviewItem[]>([]);

  useEffect(() => {
    // 1. snapshot
    fetchMarketOverview().then(setItems).catch(console.error);

    let ws: WebSocket;
    // 2. kick off broadcasts + open WS
    connectMarketOverview((tick) => {
      setItems(prev =>
        prev.map(item =>
          item.ticker === tick.ticker
            ? { ...item, close: tick.close }
            : item
        )
      );
    }).then(socket => { ws = socket; });

    return () => ws?.close();
  }, []);

  const merged = TABS.map(tab => ({
    ...tab,
    tickers: tab.tickers.map(t => {
      const live = items.find(i => i.ticker === t.ticker);
      return { ...t, close: live?.close ?? 0 };
    })
  }));

  return (
    <div className="w-full">
      {merged.filter(tab => tab.label !== "Popular").map(tab => (
        <MarketSection key={tab.label} title={tab.label} items={tab.tickers} />
      ))}
    </div>
  );
}