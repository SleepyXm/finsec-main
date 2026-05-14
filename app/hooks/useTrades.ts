import { useState, useEffect } from "react";
import { Trade } from "../types/trades";
import { postTrade, deleteTrade, openTradeSocket } from "../types/trades";

export function useTrades(
  positions: Trade[],
  setPositions: React.Dispatch<React.SetStateAction<Trade[]>>
) {
  const [error, setError] = useState<string | null>(null);

  // Open the socket once when the hook mounts, close it on unmount
  useEffect(() => {
    const socket = openTradeSocket((confirm) => {
      if (confirm.status === "error") {
        setError(confirm.error);
        return;
      }
      // Confirm arrives from the WebSocket after the flusher commits to DB
      setPositions((prev) => [...prev, {
        position_id: confirm.position_id,
        symbol: confirm.symbol,
        side: confirm.side,
        quantity: confirm.quantity,
        entry_price: confirm.entry_price,
        status: confirm.status,
        opened_at: confirm.flushed_at,
      }]);;
    });

    return () => socket.close();
  }, []);

  function placeTrade(action: "buy" | "sell", data: any, ticker: string, quantity: number, sessionId?: string) {
    const price = action === "buy" ? data.buy_price : data.close;
    if (typeof price !== "number") {
      setError("Invalid price data.");
      return;
    }
    // Fire and forget — confirm comes back through the socket
    postTrade({ ticker, action, price, quantity, session_id: sessionId });
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