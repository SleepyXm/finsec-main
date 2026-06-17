interface TradeButtonsProps {
  data: any;
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
    <div className="flex gap-4 mb-2 items-center">
      <button
        onClick={() => onTrade("sell", quantity)}
        className="w-28 h-14 bg-red-400 text-white rounded flex flex-col items-center justify-center hover:bg-red-500 transition"
      >
        <span>Sell</span>
        <small className="tabular-nums leading-none">${sellPrice}</small>
      </button>

      <input
        type="number"
        min={1}
        value={quantity}
        onChange={(e) =>
          onQuantityChange(Math.max(1, parseInt(e.target.value) || 1))
        }
        className="w-20 h-14 text-center text-white border border-gray-300 rounded px-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
      />

      <button
        onClick={() => onTrade("buy", quantity)}
        className="w-28 h-14 bg-blue-400 text-white rounded flex flex-col items-center justify-center hover:bg-blue-500 transition"
      >
        <span>Buy</span>
        <small className="tabular-nums leading-none">${buyPrice}</small>
      </button>
    </div>
  );
}