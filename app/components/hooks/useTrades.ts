import { useEffect, useRef, useState } from "react";
import { deleteTrade, openTradeSocket, postTrade } from "@/app/components/handlers/trades";
import { MAX_TRADE_QUANTITY, OrderIntent, Trade } from "@/app/components/types/trades";
import { RawData } from "@/app/components/types/charts";

type TradePriceData = Pick<RawData, "buy_price" | "close">;

export function useTrades(
  positions: Trade[],
  setPositions: React.Dispatch<React.SetStateAction<Trade[]>>,
) {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [placing, setPlacing] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const placingRef = useRef(false);
  const closingRef = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    let retry = 0;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (!active) return;
      try {
        socketRef.current = openTradeSocket({
        onOpen: () => {
          retry = 0;
          setReady(true);
          setError(null);
        },
        onConfirm: (confirm) => {
          placingRef.current = false;
          setPlacing(false);
          if (confirm.status === "error") {
            setError(confirm.error ?? "Trade failed");
            return;
          }
          setPositions((current) => current.some((position) => position.trade_id === confirm.trade_id)
            ? current
            : [...current, {
                trade_id: confirm.trade_id,
                symbol: confirm.symbol,
                side: confirm.side,
                quantity: confirm.quantity,
                price: confirm.price ?? confirm.entry_price,
                entry_price: confirm.entry_price ?? confirm.price,
                order_type: confirm.order_type ?? "market",
                stop_loss: null,
                take_profit: null,
                status: confirm.status,
                opened_at: confirm.flushed_at,
              }]);
        },
        onError: () => {
          setReady(false);
          placingRef.current = false;
          setPlacing(false);
        },
        onClose: () => {
          setReady(false);
          placingRef.current = false;
          setPlacing(false);
          if (!active) return;
          setError("Trade connection interrupted. Reconnecting…");
          const delay = Math.min(10_000, 500 * 2 ** retry++);
          reconnectTimer = window.setTimeout(connect, delay);
        },
        });
      } catch (cause) {
        setReady(false);
        setError(cause instanceof Error ? cause.message : "Trade connection is unavailable.");
      }
    };

    connect();
    return () => {
      active = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [setPositions]);

  function placeTrade(
    action: "buy" | "sell",
    data: TradePriceData,
    ticker: string,
    quantity: number,
    order: OrderIntent = { orderType: "market" },
  ) {
    const marketPrice = action === "buy" ? data.buy_price : data.close;
    const price = order.orderType === "limit" ? order.limitPrice : marketPrice;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      setError(order.orderType === "limit"
        ? "Enter a valid limit price."
        : "Valid price data is not available yet.");
      return;
    }
    if (
      order.orderType === "limit"
      && typeof marketPrice === "number"
      && (
        (action === "buy" && price > marketPrice)
        || (action === "sell" && price < marketPrice)
      )
    ) {
      setError(action === "buy"
        ? "Buy limit must be at or below the current ask."
        : "Sell limit must be at or above the current bid.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_TRADE_QUANTITY) {
      setError(`Quantity must be between 1 and ${MAX_TRADE_QUANTITY.toLocaleString()}.`);
      return;
    }
    if (placingRef.current) {
      setError("Wait for the current trade to be confirmed.");
      return;
    }

    placingRef.current = true;
    setPlacing(true);
    setError(null);
    if (!postTrade(socketRef.current, {
      ticker: ticker.trim().toUpperCase(), action,
      order_type: order.orderType, price, quantity,
    })) {
      placingRef.current = false;
      setPlacing(false);
      setError("Trade connection is still starting. Try again in a moment.");
    }
  }

  async function closeTrade(tradeId: string, exitPrice: number) {
    if (closingRef.current.has(tradeId)) return;
    const position = positions.find((candidate) => candidate.trade_id === tradeId);
    if (!position) return;
    if (position.status !== "pending" && (!Number.isFinite(exitPrice) || exitPrice <= 0)) {
      setError("A valid exit price is required.");
      return;
    }

    closingRef.current.add(tradeId);
    try {
      await deleteTrade(
        tradeId,
        position.status === "pending" ? undefined : exitPrice,
      );
      setPositions((current) => current.filter((trade) => trade.trade_id !== tradeId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to close trade");
    } finally {
      closingRef.current.delete(tradeId);
    }
  }

  return { placeTrade, closeTrade, error, ready, placing };
}
