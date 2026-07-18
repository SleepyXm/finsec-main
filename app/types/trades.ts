const WS_BACKEND_URL = process.env.NEXT_PUBLIC_WS_API_BASE2;
const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE2;

export type OrderType = "market" | "limit";

export type Trade = {
  id?: string;
  trade_id: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  price?: number | null;
  entry_price: number;
  order_type?: OrderType;
  stop_loss?: number | null;
  take_profit?: number | null;
  status: string;
  opened_at: string;
};

export type TradePatch = Partial<
  Pick<Trade, "order_type" | "price" | "stop_loss" | "take_profit">
>;

export interface OpenPositionsProps {
  positions: Trade[];
  livePnLMap: Record<string, number>;
  onClose: (tradeId: string) => void;
  accountUnrealisedPnL?: number;
}

export type TradeConfirm = Omit<Trade, "id" | "status" | "opened_at"> & {
  status: "open" | "error";
  error?: string;
  queued_at?: string;
  flushed_at: string;
};

let socket: WebSocket | null = null;

export function openTradeSocket(onConfirm: (confirm: TradeConfirm) => void): WebSocket {
    socket = new WebSocket(`${WS_BACKEND_URL}/trade`);

    socket.onmessage = (event) => {
        const confirm = JSON.parse(event.data);
        onConfirm(confirm);
    };

    socket.onerror = (err) => {
        console.error("[ws] trade socket error", err);
    };

    return socket;
}

export function postTrade(payload: {
    ticker: string;
    action: "buy" | "sell";
    price: number;
    quantity: number;
    session_id?: string;
}): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error("[ws] trade socket not open");
        return;
    }
    socket.send(JSON.stringify(payload));
    socket.onclose = (event) => {
    console.error("[ws] trade socket closed", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
    });
  };
}

export async function deleteTrade(tradeId: string, exitPrice: number, realisedPnl: number, sessionId?: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/trade/${tradeId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exit_price: exitPrice, realised_pnl: realisedPnl, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`Failed to delete trade: ${res.status}`);
}
