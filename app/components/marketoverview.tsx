import { useEffect, useState } from "react";
import Link from "next/link";
import { MarketOverviewItem } from "../types/assets";
import { RawData } from "../types/charts";
import { LinechartIntraday } from "../chart/chartrender";
import { fetchMarketOverview, fetchIntraday } from "../types/assets";
import { MarketSection } from "./MarketSection";

const TABS = [
  { label: "Popular",     tickers: ["SPY", "BTC-USD", "QQQ", "GBPUSD=X", "ETH-USD"] },
  { label: "Indices",     tickers: ["SPY", "QQQ", "DIA", "IWM", "ES=F", "^FTSE"] },
  { label: "Futures",     tickers: ["NQ=F", "GC=F", "SI=F", "MNQ=F"] },
  { label: "Crypto",      tickers: ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD"] },
  { label: "Forex",       tickers: ["GBPUSD=X", "EURUSD=X", "USDJPY=X", "AUDUSD=X"] },
  { label: "Commodities", tickers: ["GC=F", "CL=F", "SI=F", "NG=F"] },
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
          <div className="w-full h-[200px] overflow-hidden scale-y-[0.4] origin-top">
            <LinechartIntraday data={chartData} minimal />
          </div>
        )}
      </div>
    </Link>
  );
}

export default function MarketOverview() {
  const [items, setItems] = useState<MarketOverviewItem[]>([]);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    fetchMarketOverview().then(setItems).catch(console.error);
  }, []);

  const visibleItems = items.filter(item =>
    TABS[activeTab].tickers.includes(item.ticker)
  );

  return (
    <div>
      <MarketSection title="Indices" items={items.filter(i => ["SPY", "QQQ", "DIA", "IWM", "ES=F", "^FTSE"].includes(i.ticker))} />
      <MarketSection title="Crypto" items={items.filter(i => ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD"].includes(i.ticker))} />
      <MarketSection title="Futures" items={items.filter(i => ["NQ=F", "GC=F", "SI=F", "MNQ=F"].includes(i.ticker))} />
      <MarketSection title="Forex" items={items.filter(i => ["GBPUSD=X", "EURUSD=X", "USDJPY=X"].includes(i.ticker))} />
    </div>
  );
}