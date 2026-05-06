interface TradeButtonsProps {
  data: any;
  onTrade: (action: "buy" | "sell") => void;
}


export default function TradeButtons({ data, onTrade }: TradeButtonsProps) {
  if (!data) return null;

  return (
    <div className="flex gap-4 mb-2 items-center">
      <button
        onClick={() => onTrade("sell")}
        className="bg-red-400 text-white px-4 py-2 rounded flex flex-col items-center hover:bg-red-500 transition"
      >
        Sell
        <small>${typeof data.close === "number" ? data.close.toFixed(2) : "-"}</small>
      </button>

      <button
        onClick={() => onTrade("buy")}
        className="bg-blue-400 text-white px-4 py-2 rounded flex flex-col items-center hover:bg-blue-500 transition"
      >
        Buy
        <small>${typeof data.buy_price === "number" ? data.buy_price.toFixed(2) : "-"}</small>
      </button>
    </div>
  );
}