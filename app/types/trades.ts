import axios from "axios";

const BACKEND_URL = "http://localhost:9000/api";

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

export async function postTrade(payload: {ticker: string; action: "buy" | "sell"; price: number; quantity: number; buy_price: number; sell_price: number; time: any; session_id?: string;}): Promise<Trade> {
  const res = await fetch(`${BACKEND_URL}/trade`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to place trade: ${res.status}`);
  const data = await res.json();
  return data.data;
}

export async function deleteTrade(positionId: string, exitPrice: number, realisedPnl: number, sessionId?: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/trade/${positionId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exit_price: exitPrice, realised_pnl: realisedPnl, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`Failed to delete trade: ${res.status}`);
}