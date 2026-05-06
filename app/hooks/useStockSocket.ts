import { useEffect, useRef, useState } from "react";
import { createStockSocket, StockTick, PositionClosedEvent, AccountPnLEvent, WSMessage } from "@/app/types/websocket";
import { Trade } from "@/app/types/trades";

export function useStockSocket(
  ticker: string,
  interval: string = "1m",
  positions: Trade[],
  onPositionClosed: (positionId: string) => void,
  onAccountPnL: (unrealised: number) => void,
) {
  const [tick, setTick] = useState<StockTick | null>(null);
  const [historicalData, setHistoricalData] = useState<StockTick[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const connectionIdRef = useRef(0);
  

  useEffect(() => {
  if (!ticker) return;

  connectionIdRef.current += 1;
  const connectionId = connectionIdRef.current;

  if (wsRef.current) {
    wsRef.current.onmessage = null;
    wsRef.current.close();
    wsRef.current = null;
  }

  setHistoricalData([]);
  setTick(null);

  const ws = createStockSocket(
    ticker,
    interval,
    (msg: WSMessage) => {
      // Ignore stale sockets completely
      if (connectionId !== connectionIdRef.current) {
        return;
      }

      if ("type" in msg && msg.type === "position_closed") {
        onPositionClosed(msg.data.position_id);
        return;
      }

      if ("type" in msg && msg.type === "historical") {
        setHistoricalData(msg.data);
        return;
      }

      if ("type" in msg && msg.type === "account_pnl") {
        onAccountPnL(msg.data.unrealised_pnl);
        return;
      }

      const priceTick = msg as StockTick;

      // Extra safety
      if (priceTick.ticker !== ticker) {
        return;
      }

      setTick(priceTick);
    },
    () => {
      if (connectionId === connectionIdRef.current) {
        setConnected(false);
      }
    }
  );

  ws.onopen = () => {
    if (connectionId === connectionIdRef.current) {
      setConnected(true);
    }
  };
  

  wsRef.current = ws;

  return () => {
    ws.onmessage = null;
    ws.close();

    if (connectionId === connectionIdRef.current) {
      connectionIdRef.current += 1;
    }

    wsRef.current = null;
  };
  }, [ticker, interval]);
  
  
  const filteredPositions = positions.filter(
    p => p.symbol === ticker
  );

  const livePnLMap = computeLivePnL(filteredPositions, tick?.close ?? null);

  return { tick, historicalData, connected, livePnLMap };
}

function computeLivePnL(
  positions: Trade[],
  currentPrice: number | null
): Record<string, number> {
  if (currentPrice === null) return {};

  return Object.fromEntries(
    positions.map((p) => {
      const direction = p.side === "long" ? 1 : -1;
      const pnl = (currentPrice - p.entry_price) * direction * p.quantity;
      return [p.position_id, pnl];
    })
  );
}