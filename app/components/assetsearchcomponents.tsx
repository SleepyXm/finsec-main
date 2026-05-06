import { useState } from "react";
import Link from "next/link";
import { RawData } from "../types/charts";
import { Asset } from "../types/assets";
import { LinechartIntraday } from "../chart/chartrender";

interface AssetSearchBarProps {
  onSearch: (query: string) => void;
}

interface AssetListItemProps {
  asset: Asset;
  chartData: RawData[];
}

export function AssetSearchBar({ onSearch }: AssetSearchBarProps) {
  const [input, setInput] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(input);
      }}
      className="flex gap-2 mb-8"
    >
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search for an asset..."
        className="px-4 py-3 text-base rounded-l-full border border-gray-300 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-300 bg-white text-gray-600 shadow-sm"
        style={{ width: "450px" }}
      />
      <button
        type="submit"
        className="px-5 py-3 text-base cursor-pointer bg-[#343f52] text-white rounded-r-full"
        style={{ width: "150px" }}
      >
        Search
      </button>
    </form>
  );
}


export function AssetListItem({ asset, chartData }: AssetListItemProps) {
  return (
    <li className="mb-8 p-6 border border-gray-200 rounded-lg shadow-sm">
      <Link href={`/chart/${asset.symbol}`}>
        <div className="font-semibold mb-2">
          {asset.symbol} — {asset.shortname}
        </div>
      </Link>

      {chartData.length > 0 && (
        <div className="mt-4 w-full max-w-[600px] h-[150px]">
          <LinechartIntraday data={chartData} />
        </div>
      )}
    </li>
  );
}