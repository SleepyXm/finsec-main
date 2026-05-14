import { useEffect, useState } from "react";
import { LinechartIntraday } from "../chartrender/charts/LinechartIntraday";
import { fetchIntraday } from "@/app/types/assets";
import { AssetPill } from "@/app/components/intradaymarket/components/UI";

export function MarketSection({ title, items }: { title: string; items: { ticker: string, name: string, close: number,  }[] }) {
  const [selected, setSelected] = useState(items[0]?.ticker ?? "");
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    if (!selected) return;
    setChartData([]);
    fetchIntraday(selected).then(setChartData).catch(console.error);
  }, [selected]);

  
  useEffect(() => {
  if (items.length > 0 && !selected) {
    setSelected(items[0].ticker);
  }
}, [items]);

  return (
    <div className="mb-8">
      <h2 className="text-5xl font-bold text-white px-6 mb-4">{title} ›</h2>
      
      {/* CONTAINER FOR PILLS */}
      <div className="relative overflow-hidden">
        {/* LEFT FADE */}
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-8 bg-gradient-to-r from-[#1a1f2b] to-transparent" />

        {/* RIGHT FADE */}
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-8 bg-gradient-to-l from-[#1a1f2b] to-transparent" />




        <div className="flex gap-2 px-6 overflow-x-auto pb-2 max-w-375 scrollbar-hide">
          {items.map((item) => (
            <AssetPill
              key={item.ticker}
              ticker={item.ticker}
              name={item.name}
              close={item.close}
              selected={selected === item.ticker}
              onSelect={() => setSelected(item.ticker)}
            />
          ))}
        </div>
        </div>

        <div className="px-6 mt-4 h-[300px]">
          {chartData.length > 0
            ? <LinechartIntraday data={chartData} minimal />
            : <div className="w-full h-full bg-[#1a1f2e00] rounded-lg flex items-center justify-center text-[#5d6578] text-sm">Loading...</div>
          }
        </div>
      </div>
  );
}