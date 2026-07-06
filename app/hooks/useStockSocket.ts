import { useEffect, useRef, useState, useCallback } from "react";
import { createStockSocket, StockTick, WSMessage } from "@/app/types/websocket";
import { Trade } from "@/app/types/trades";

export function useStockSocket(
  ticker: string,
  interval: string = "1m",
  positions: Trade[],
  onPositionClosed: (tradeId: string) => void,
  onAccountPnL: (unrealised: number) => void,
) {
  const [tick, setTick] = useState<StockTick | null>(null);
  const [historicalData, setHistoricalData] = useState<StockTick[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const connectionIdRef = useRef(0);
  const currentPageRef = useRef(1);
  const receivedPagesRef = useRef<Set<number>>(new Set());
  const totalPagesRef = useRef(1);

  useEffect(() => {
    if (!ticker) return;

    // increment first — this is the ID for this connection
    connectionIdRef.current += 1;
    const connectionId = connectionIdRef.current;

    // close previous socket synchronously before opening a new one
    if (wsRef.current) {
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // reset all per-connection state
    currentPageRef.current = 1;
    receivedPagesRef.current = new Set();
    totalPagesRef.current = 1;
    setHistoricalData([]);
    setTick(null);
    setLoadingMore(false);

    const ws = createStockSocket(
      ticker,
      interval,
      (msg: WSMessage) => {
        if (connectionId !== connectionIdRef.current) return;

        if ("type" in msg && msg.type === "trade_closed") {
          onPositionClosed(msg.data.trade_id);
          return;
        }

        if ("type" in msg && msg.type === "historical") {
          const page = msg.page ?? 1;
          totalPagesRef.current = msg.total_pages ?? 1;
          console.log("[ws] received historical page:", page, "| candles:", msg.data.length, "| total pages:", totalPagesRef.current);

          if (receivedPagesRef.current.has(page)) {
            console.warn("[ws] duplicate page, skipping:", page);
            return;
          }
          receivedPagesRef.current.add(page);

          setHistoricalData(prev =>
            [...prev, ...msg.data].sort((a, b) => a.time - b.time)
          );
          setLoadingMore(false);
          return;
        }

        if ("type" in msg && msg.type === "account_pnl") {
          onAccountPnL(msg.data.unrealised_pnl);
          return;
        }

        const priceTick = msg as StockTick;
        if (priceTick.ticker !== ticker) return;
        setTick(priceTick);
      },
      () => {
        if (connectionId === connectionIdRef.current) setConnected(false);
      },
    );

    ws.onopen = () => {
      if (connectionId === connectionIdRef.current) setConnected(true);
    };

    wsRef.current = ws;

    // cleanup: just close the socket, never touch connectionIdRef here
    return () => {
      ws.onmessage = null;
      ws.close();
      wsRef.current = null;
    };
  }, [ticker, interval]);

  const loadPage = useCallback((page: number) => {
    const ws = wsRef.current;
    console.log("[loadPage] page:", page, "| ws state:", ws?.readyState, "| loadingMore:", loadingMore);
    console.log("[loadPage] received so far:", [...receivedPagesRef.current], "| total:", totalPagesRef.current);

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("[loadPage] socket not open");
      return;
    }
    if (loadingMore) {
      console.warn("[loadPage] already loading");
      return;
    }
    if (receivedPagesRef.current.has(page)) {
      console.warn("[loadPage] already have page:", page);
      return;
    }
    if (page > totalPagesRef.current) {
      console.warn("[loadPage] page exceeds total:", page, ">", totalPagesRef.current);
      return;
    }

    currentPageRef.current = page;
    setLoadingMore(true);
    const payload = JSON.stringify({ type: "load_page", page });
    console.log("[loadPage] sending:", payload);
    ws.send(payload);
  }, [loadingMore]);

  const loadPreviousPage = useCallback(() => {
  const loaded = receivedPagesRef.current;
  const maxPage = loaded.size ? Math.max(...loaded) : 1; // highest page = oldest loaded
  const nextPage = maxPage + 1; // next older page
  
  if (nextPage > totalPagesRef.current) {
    console.warn("[loadPreviousPage] no more pages");
    return;
  }
  loadPage(nextPage);
}, [loadPage]);

  const filteredPositions = positions.filter(p => p.symbol === ticker);
  const livePnLMap = computeLivePnL(filteredPositions, tick?.close ?? null);

  return { tick, historicalData, connected, livePnLMap, loadingMore, loadPage, loadPreviousPage };
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
      return [p.trade_id, pnl];
    })
  );
}
