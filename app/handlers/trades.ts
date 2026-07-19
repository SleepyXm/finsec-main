import { request } from "@/app/handlers/auth";
import type { TradeConfirm } from "@/app/types/trades";

const WS_BACKEND_URL = process.env.NEXT_PUBLIC_WS_API_BASE2;

type TradeSocketHandlers = {
  onConfirm: (confirm: TradeConfirm) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
};

export function openTradeSocket(handlers: TradeSocketHandlers): WebSocket {
  if (!WS_BACKEND_URL) throw new Error("Trade server is not configured.");
  const socket = new WebSocket(`${WS_BACKEND_URL}/trade`);
  socket.onopen = () => handlers.onOpen?.();
  socket.onclose = () => handlers.onClose?.();
  socket.onerror = () => handlers.onError?.();
  socket.onmessage = (event) => {
    try {
      const confirm = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (confirm.status !== "open" && confirm.status !== "error") {
        handlers.onConfirm({ status: "error", error: "Invalid trade confirmation" });
        return;
      }
      if (
        confirm.status === "open"
        && (
          typeof confirm.trade_id !== "string"
          || typeof confirm.symbol !== "string"
          || (confirm.side !== "long" && confirm.side !== "short")
          || typeof confirm.quantity !== "number"
          || typeof confirm.entry_price !== "number"
          || typeof confirm.flushed_at !== "string"
        )
      ) {
        handlers.onConfirm({ status: "error", error: "Incomplete trade confirmation" });
        return;
      }
      handlers.onConfirm(confirm as unknown as TradeConfirm);
    } catch {
      handlers.onConfirm({ status: "error", error: "Invalid trade confirmation" });
    }
  };
  return socket;
}

export function postTrade(socket: WebSocket | null, payload: {
  ticker: string;
  action: "buy" | "sell";
  price: number;
  quantity: number;
}): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

export async function deleteTrade(tradeId: string, exitPrice: number): Promise<void> {
  await request(`/api/trade/${tradeId}`, {
    method: "DELETE",
    body: JSON.stringify({ exit_price: exitPrice }),
  });
}
