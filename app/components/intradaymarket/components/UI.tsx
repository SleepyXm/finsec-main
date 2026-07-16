import { useState } from "react";
import { TraderBlankButton, traderCornerOpacity } from "@/app/ui";

export const LOGO_MAP: Record<string, string> = {
  "ES=F":     "/logos/sp500.png",
  "NQ=F":     "/logos/nasdaq.png",
  "MNQ=F":    "/logos/nasdaq.png",
  "^FTSE":    "/logos/ftse.png",
  "BTC-USD":  "/logos/bitcoin.png",
  "ETH-USD":  "/logos/ethereum.png",
  "SOL-USD":  "/logos/solana.png",
  "BNB-USD":  "/logos/bnb.png",
  "GBPUSD=X": "/logos/gbpusd.png",
  "EURUSD=X": "/logos/eurusd.png",
  "JPY=X":    "/logos/usdjpy.png",
  "AUDUSD=X": "/logos/audusd.png",
  "GC=F":     "/logos/gold.png",
  "SI=F":     "/logos/silver.png",
  "CL=F":     "/logos/crudeoil.png",
  "NG=F":     "/logos/natgas.png",
  "AAPL":     "/logos/apple.png",
  "GOOGL":    "/logos/google.png",
  "META":     "/logos/meta.png",
  "NVDA":     "/logos/nvidia.png",
  "MSFT":     "/logos/microsoft.png",
  "AMZN":     "/logos/amazon.png",
  "TSLA":     "/logos/tesla.png",
};


export function AssetPill({
  ticker,
  name,
  close,
  selected,
  onSelect,
}: {
  ticker: string;
  name: string;
  close: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const closeLabel = Number.isFinite(close)
    ? close.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";

  return (
    <TraderBlankButton
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      active={selected}
      hovered={hovered}
      cornerOpacity={
        selected ? traderCornerOpacity.active : traderCornerOpacity.subtle
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
        scrollSnapAlign: "start",
        width: 280,
        minHeight: 84,
        textAlign: "left",
      }}
      className="shrink-0"
    >
      <img
        src={LOGO_MAP[ticker] ?? undefined}
        onError={(e) => e.currentTarget.style.display = 'none'}
        alt=""
        className="w-12 h-12 rounded-full shrink-0"
      />
      <div className="text-left">
        <div className="text-xl font-medium text-white leading-tight">{name}</div>
        <div className="text-m text-[#8a90a0] leading-tight">
          {closeLabel}
        </div>
      </div>
    </TraderBlankButton>
  );
}
