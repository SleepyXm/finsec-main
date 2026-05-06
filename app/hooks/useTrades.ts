import { useState } from "react";
import { Trade } from "../types/trades";
import { postTrade, deleteTrade } from "../types/trades";

export function useTrades(
  positions: Trade[],
  setPositions: React.Dispatch<React.SetStateAction<Trade[]>>
) {
  const [error, setError] = useState<string | null>(null);

  async function placeTrade(action: "buy" | "sell", data: any, ticker: string, sessionId?: string) {
    const price = action === "buy" ? data.buy_price : data.close;
    if (typeof price !== "number") {
      setError("Invalid price data.");
      return;
    }

    try {
      const trade = await postTrade({
        ticker,
        action,
        price,
        quantity: 1,
        buy_price: data.buy_price,
        sell_price: data.close,
        time: data.time,
        session_id: sessionId,
      });
      setPositions((prev) => [...prev, { ...trade, position_id: trade.position_id ?? trade.id }]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to place trade");
    }
  }

  async function closeTrade(positionId: string, exitPrice: number, sessionId?: string) {
    try {
      const position = positions.find((p) => p.position_id === positionId);
      if (!position) return;

      const direction = position.side === "long" ? 1 : -1;
      const realisedPnl = Math.round((exitPrice - position.entry_price) * direction * position.quantity * 100) / 100;

      await deleteTrade(positionId, exitPrice, realisedPnl, sessionId);
      setPositions((prev) => prev.filter((t) => t.position_id !== positionId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close trade");
    }
  }

  return { placeTrade, closeTrade, error };
}