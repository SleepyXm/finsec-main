interface TradeButtonsProps {
  data: any;
  onTrade: (action: "buy" | "sell", quantity: number) => void;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
}


export default function TradeButtons({ data, onTrade, quantity, onQuantityChange  }: TradeButtonsProps) {
  if (!data) return null;

  return (
    <div className="flex gap-4 mb-2 items-center">
      <button
        onClick={() => onTrade("sell", quantity)}
        className="bg-red-400 text-white px-4 py-2 rounded flex flex-col items-center hover:bg-red-500 transition"
      >
        Sell
        <small>${typeof data.close === "number" ? data.close.toFixed(2) : "-"}</small>
      </button>

      <input
        type="number"
        min={1}
        value={quantity}
        onChange={(e) => onQuantityChange(Math.max(1, parseInt(e.target.value) || 1))}
        className="w-20 text-center text-white border border-gray-300 rounded px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
      />


      <button
        onClick={() => onTrade("buy", quantity)}
        className="bg-blue-400 text-white px-4 py-2 rounded flex flex-col items-center hover:bg-blue-500 transition"
      >
        Buy
        <small>${typeof data.buy_price === "number" ? data.buy_price.toFixed(2) : "-"}</small>
      </button>
    </div>
  );
}