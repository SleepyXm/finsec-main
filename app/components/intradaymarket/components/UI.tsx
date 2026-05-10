export function AssetPill({
  ticker,
  name,
  close,
  selected,
  onSelect,
}: {
  ticker: string;
  name: string;
  close: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`
        shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all w-400px
        ${selected
          ? "bg-[#1e2d40] border-[#2962ff]"
          : "bg-[#1a1f2e] border-[#2a2e3a] hover:border-[#3a4060]"
        }
      `}
    >
      <img
        src={`https://your-r2-url/${ticker}.svg`}
        onError={(e) => e.currentTarget.style.display = 'none'}
        className="w-6 h-6 rounded-full shrink-0"
      />
      <div className="text-left">
        <div className="text-sm font-medium text-white leading-tight">{name}</div>
        <div className="text-xs text-[#8a90a0] leading-tight">
          {close !== null ? close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
        </div>
      </div>
    </button>
  );
}