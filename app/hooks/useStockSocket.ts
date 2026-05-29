import { useEffect, useRef, useState, useCallback } from "react";
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
  const totalPagesRef = useRef(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const connectionIdRef = useRef(0);
  const currentPageRef = useRef(1); // Curent page
  const receivedPagesRef = useRef<Set<number>>(new Set()); // Pages on frontend
  

  useEffect(() => {
  if (!ticker) return;

  connectionIdRef.current += 1;
  const connectionId = connectionIdRef.current;

  // Reset count on ticker / interval change
  currentPageRef.current = 1;
  receivedPagesRef.current = new Set();
  totalPagesRef.current = 1;

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
        const page = msg.page ?? 1;   // server should include page number in payload
        totalPagesRef.current = msg.total_pages ?? 1;
        console.log("[ws] total pages:", totalPagesRef.current);
        console.log("[ws] received historical page:", page, "| candles:", msg.data.length);
        console.log("[ws] already received pages:", [...receivedPagesRef.current]);
        if (receivedPagesRef.current.has(page)) return;
        receivedPagesRef.current.add(page);

        setHistoricalData(prev =>
          // prepend older pages, append newer ones
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
    },
    1,
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

  // call this to load older history (scroll back in time)
  const loadPage = useCallback((page: number) => {
  const ws = wsRef.current;
  console.log("[loadPage] called with page:", page, "| ws state:", ws?.readyState, "| loadingMore:", loadingMore);
  console.log("[loadPage] already received pages:", [...receivedPagesRef.current]);

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn("[loadPage] socket not open, aborting");
    return;
  }
  if (loadingMore) {
    console.warn("[loadPage] already loading, aborting");
    return;
  }
  if (receivedPagesRef.current.has(page)) {
    console.warn("[loadPage] page already received, aborting:", page);
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
    const minPage = loaded.size ? Math.min(...loaded) : 1;
     const nextPage = minPage + 1;
    if (nextPage > totalPagesRef.current) {
      console.warn("[loadPreviousPage] no more pages");
      return;
    }
    loadPage(minPage + 1); // page 2 = older data, not 0
  }, [loadPage]);

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
      return [p.position_id, pnl];
    })
  );
}