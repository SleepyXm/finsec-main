import { QuantityStepper } from "@/app/UI/client";
import { RawData } from "@/app/components/types/charts";
import { MAX_TRADE_QUANTITY } from "@/app/components/types/trades";

interface TradeButtonsProps {
  data?: Pick<RawData, "close" | "buy_price"> | null;
  onTrade: (action: "buy" | "sell", quantity: number) => void;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  disabled?: boolean;
}

function normalisePriceDisplay(value: number | string | null | undefined) {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return "-";
  return number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


export default function TradeButtons({ data, onTrade, quantity, onQuantityChange, disabled = false }: TradeButtonsProps) {
  if (!data) return null;

  const sellPrice = normalisePriceDisplay(data.close);
  const buyPrice = normalisePriceDisplay(data.buy_price);
  const unavailable = disabled || sellPrice === "-" || buyPrice === "-";

  return (
    <div className="flex gap-2 mb-2 items-center">
      <button
        type="button"
        disabled={unavailable}
        onClick={() => onTrade("sell", quantity)}
        className="flex h-12 w-20 flex-col items-center justify-center rounded bg-red-500/65 text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="text-xs">SELL</span>
        <small className="tabular-nums leading-none font-bold">${sellPrice}</small>
      </button>

      <QuantityStepper
        value={quantity}
        onChange={onQuantityChange}
        max={MAX_TRADE_QUANTITY}
      />

      <button
        type="button"
        disabled={unavailable}
        onClick={() => onTrade("buy", quantity)}
        className="flex h-12 w-20 flex-col items-center justify-center rounded bg-blue-500/65 text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="text-xs">BUY</span>
        <small className="tabular-nums leading-none font-bold">${buyPrice}</small>
      </button>
    </div>
  );
}
