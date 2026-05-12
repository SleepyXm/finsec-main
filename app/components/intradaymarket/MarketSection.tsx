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

      <div className="flex gap-2 px-6 overflow-x-auto pb-2">
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

      <div className="px-6 mt-4 h-[300px]">
        {chartData.length > 0
          ? <LinechartIntraday data={chartData} minimal />
          : <div className="w-full h-full bg-[#1a1f2e00] rounded-lg flex items-center justify-center text-[#5d6578] text-sm">Loading...</div>
        }
      </div>
    </div>
  );
}