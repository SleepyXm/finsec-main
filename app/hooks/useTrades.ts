import { useState, useEffect } from "react";
import { Trade } from "../types/trades";
import { postTrade, deleteTrade, openTradeSocket } from "../types/trades";
import { RawData } from "../types/charts";

type TradePriceData = Pick<RawData, "buy_price" | "close">;

export function useTrades(
  positions: Trade[],
  setPositions: React.Dispatch<React.SetStateAction<Trade[]>>
) {
  const [error, setError] = useState<string | null>(null);

  // Open the socket once when the hook mounts, close it on unmount
  useEffect(() => {
    const socket = openTradeSocket((confirm) => {
      if (confirm.status === "error") {
        setError(confirm.error ?? "Trade failed");
        return;
      }
      // Confirm arrives from the WebSocket after the flusher commits to DB
      setPositions((prev) => [...prev, {
        trade_id: confirm.trade_id,
        symbol: confirm.symbol,
        side: confirm.side,
        quantity: confirm.quantity,
        price: confirm.price ?? confirm.entry_price,
        entry_price: confirm.entry_price,
        order_type: confirm.order_type ?? "market",
        stop_loss: confirm.stop_loss ?? null,
        take_profit: confirm.take_profit ?? null,
        status: confirm.status,
        opened_at: confirm.flushed_at,
      }]);;
    });

    return () => socket.close();
  }, []);

  function placeTrade(action: "buy" | "sell", data: TradePriceData, ticker: string, quantity: number, sessionId?: string) {
    const price = action === "buy" ? data.buy_price : data.close;
    if (typeof price !== "number") {
      setError("Invalid price data.");
      return;
    }
    // Fire and forget — confirm comes back through the socket
    postTrade({ ticker, action, price, quantity, session_id: sessionId });
  }

  async function closeTrade(tradeId: string, exitPrice: number, sessionId?: string) {
    try {
      const position = positions.find((p) => p.trade_id === tradeId);
      if (!position) return;
      const direction = position.side === "long" ? 1 : -1;
      const realisedPnl = Math.round((exitPrice - position.entry_price) * direction * position.quantity * 100) / 100;
      await deleteTrade(tradeId, exitPrice, realisedPnl, sessionId);
      setPositions((prev) => prev.filter((t) => t.trade_id !== tradeId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close trade");
    }
  }

  return { placeTrade, closeTrade, error };
}
