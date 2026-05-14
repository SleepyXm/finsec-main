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
  return (
    <button
      onClick={onSelect}
      className={`
        shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-4xl border transition-all w-80 h-25
        ${selected
          ? "bg-[#1e2d40] border-[#2962ff]"
          : "bg-[#1a1f2e] border-[#2a2e3a] hover:border-[#3a4060]"
        }
      `}
    >
      <img
        src={LOGO_MAP[ticker] ?? undefined}
        onError={(e) => e.currentTarget.style.display = 'none'}
        className="w-12 h-12 rounded-full shrink-0"
      />
      <div className="text-left">
        <div className="text-xl font-medium text-white leading-tight">{name}</div>
        <div className="text-m text-[#8a90a0] leading-tight">
          {close !== null ? close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
        </div>
      </div>
    </button>
  );
}