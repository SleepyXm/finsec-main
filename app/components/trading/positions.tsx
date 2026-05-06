import { Trade, OpenPositionsProps } from "@/app/types/trades";

export default function OpenPositions({ positions, livePnLMap, onClose }: OpenPositionsProps) {
  if (!positions.length) return null;

  return (
    <div className="bg-zinc-800 p-3 rounded shadow-md">
      <h3 className="font-semibold mb-2">Open Positions</h3>
      <ul className="space-y-2">
        {positions.map((position) => {
          const id = position.position_id ?? (position as any).id;
          const livePnL = livePnLMap[id] ?? 0;
          return (
            <li
              key={id}
              className="flex justify-between items-center p-2 rounded border border-gray-700"
            >
              <div>
                <p className="text-sm font-medium">
                  {position.side.toUpperCase()} {position.symbol}
                </p>
                <p className="text-xs text-gray-600">
                  Entry: ${position.entry_price.toFixed(2)} | Qty: {position.quantity} | Live PnL:{" "}
                  <span className={livePnL >= 0 ? "text-green-600" : "text-red-600"}>
                    ${livePnL.toFixed(2)}
                  </span>
                </p>
              </div>
              <button
                onClick={() => onClose(id)}
                className="text-sm text-red-500 hover:underline"
              >
                X
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}