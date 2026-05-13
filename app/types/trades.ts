import axios from "axios";

const WS_BACKEND_URL = process.env.NEXT_PUBLIC_WS_API_BASE2;
const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE2;

export type Trade = {
  id?: string;
  position_id?: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entry_price: number;
  status: string;
  opened_at: string;
};

export interface OpenPositionsProps {
  positions: Trade[];
  livePnLMap: Record<string, number>;
  onClose: (positionId: string) => void;
}

let socket: WebSocket | null = null;

export function openTradeSocket(onConfirm: (confirm: any) => void): WebSocket {
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

export async function deleteTrade(positionId: string, exitPrice: number, realisedPnl: number, sessionId?: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/trade/${positionId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exit_price: exitPrice, realised_pnl: realisedPnl, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`Failed to delete trade: ${res.status}`);
}