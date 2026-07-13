import { useState } from "react";
import Link from "next/link";
import { Asset } from "../types/assets";

interface AssetSearchBarProps {
  onSearch: (query: string) => void;
}


interface AssetListItemProps {
  asset: Asset;
  onSelect?: (asset: Asset) => void;
}

export function AssetSearchBar({ onSearch }: AssetSearchBarProps) {
  const [input, setInput] = useState("");
  return (
    <form
      onChange={(e) => { e.preventDefault(); onSearch(input); }}
      className="flex h-9 w-full max-w-[280px] items-center gap-2 rounded-4xl border border-[#2a2e3a] bg-white px-3 transition-all focus-within:border-[#2962ff]"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5d6578" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search assets..."
        className="bg-transparent border-none outline-none text-sm text-black placeholder-[#5d6578] w-full"
      />
      {input && (
        <button
          type="button"
          onClick={() => { setInput(""); onSearch(""); }}
          className="text-[#5d6578] hover:text-white transition-all shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      )}
    </form>
  );
}

export function AssetListItem({ asset, onSelect }: AssetListItemProps) {
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[#1e2d40] transition-all">
      <div className="w-8 h-8 rounded-full bg-[#2a2e3a] shrink-0" />
      <div>
        <div className="text-sm font-medium text-white">{asset.symbol}</div>
        <div className="text-xs text-[#5d6578]">{asset.shortname}</div>
      </div>
    </div>
  );

  return (
    <li className="border-b border-[#2a2e3a] last:border-none">
      {onSelect ? (
        <button className="w-full text-left" onClick={() => onSelect(asset)}>
          {inner}
        </button>
      ) : (
        <Link href={`/chart/${asset.symbol}`}>{inner}</Link>
      )}
    </li>
  );
}
