import { useEffect, useState } from "react";
import Link from "next/link";
import { MarketOverviewItem } from "../types/assets";
import { RawData } from "../types/charts";
import { LinechartIntraday } from "../chart/chartrender";
import { fetchMarketOverview, fetchIntraday } from "../types/assets";

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
          <div className="w-full h-[80px]">
            <LinechartIntraday data={chartData} />
          </div>
        )}
      </div>
    </Link>
  );
}

export default function MarketOverview() {
  const [items, setItems] = useState<MarketOverviewItem[]>([]);

  useEffect(() => {
    fetchMarketOverview().then(setItems).catch(console.error);
  }, []);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-6">
      {items.map((item) => (
        <OverviewCard key={item.ticker} item={item} />
      ))}
    </div>
  );
}