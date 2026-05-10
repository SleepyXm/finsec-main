import { useEffect, useState } from "react";
import { LinechartIntraday } from "../chart/chartrender";
import { fetchIntraday } from "../types/assets";

export function MarketSection({ title, items }: { title: string; items: { ticker: string, name: string }[] }) {
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
      <h2 className="text-lg font-medium text-white px-6 mb-3">{title} ›</h2>

      <div className="flex gap-2 px-6 overflow-x-auto pb-2">
        {items.map((item) => (
          <button
            key={item.ticker}
            onClick={() => setSelected(item.ticker)}
            className={`
              shrink-0 px-4 py-2 rounded-lg border text-sm transition-all
              ${selected === item.ticker
                ? "bg-[#1e2d40] border-[#2962ff] text-white"
                : "bg-[#1a1f2e] border-[#2a2e3a] text-[#8a90a0] hover:border-[#3a4060]"
              }
            `}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="px-6 mt-4 h-[300px]">
        {chartData.length > 0
          ? <LinechartIntraday data={chartData} />
          : <div className="w-full h-full bg-[#1a1f2e] rounded-lg flex items-center justify-center text-[#5d6578] text-sm">Loading...</div>
        }
      </div>
    </div>
  );
}