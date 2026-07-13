import { QuantityStepper } from "@/app/ui/client";

interface TradeButtonsProps {
  data?: {
    close?: number | null;
    buy_price?: number | null;
  } | null;
  onTrade: (action: "buy" | "sell", quantity: number) => void;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
}

function normalisePriceDisplay(value: number | string | null | undefined) {
  if (value == null) return "-";

  const raw = String(value);

  if (raw === "" || raw === "NaN") return "-";

  if (!raw.includes(".")) {
    return `${raw}.00`;
  }

  const [whole, decimals = ""] = raw.split(".");

  if (decimals.length === 0) {
    return `${whole}.00`;
  }

  if (decimals.length === 1) {
    return `${whole}.${decimals}0`;
  }

  return raw;
}


export default function TradeButtons({ data, onTrade, quantity, onQuantityChange, }: TradeButtonsProps) {
  if (!data) return null;

  const sellPrice =
    typeof data.close === "number" ? normalisePriceDisplay(data.close) : "-";

  const buyPrice =
    typeof data.buy_price === "number"
      ? normalisePriceDisplay(data.buy_price)
      : "-";

  return (
    <div className="flex gap-2 mb-2 items-center">
      <button
        onClick={() => onTrade("sell", quantity)}
        className="w-20 h-12 bg-red-500/65 text-white rounded flex flex-col items-center justify-center hover:bg-red-600 transition"
      >
        <span className="text-xs">SELL</span>
        <small className="tabular-nums leading-none font-bold">${sellPrice}</small>
      </button>

      <QuantityStepper
        value={quantity}
        onChange={onQuantityChange}
      />

      <button
        onClick={() => onTrade("buy", quantity)}
        className="w-20 h-12 bg-blue-500/65 text-white rounded flex flex-col items-center justify-center hover:bg-blue-600 transition"
      >
        <span className="text-xs">BUY</span>
        <small className="tabular-nums leading-none font-bold">${buyPrice}</small>
      </button>
    </div>
  );
}
