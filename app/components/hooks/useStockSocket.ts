import { useEffect, useRef, useState, useCallback } from "react";
import { createStockSocket, StockTick, WSMessage } from "@/app/components/types/websocket";
import { Trade } from "@/app/components/types/trades";

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
  const loadingPageRef = useRef<number | null>(null);

  const loadPage = useCallback((page: number) => {
    const ws = wsRef.current;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("[loadPage] socket not open");
      return false;
    }
    if (loadingPageRef.current !== null) {
      console.warn("[loadPage] already loading page:", loadingPageRef.current);
      return false;
    }
    if (receivedPagesRef.current.has(page)) {
      console.warn("[loadPage] already have page:", page);
      return false;
    }
    if (page < 1 || page > totalPagesRef.current) {
      console.warn("[loadPage] page outside available range:", page);
      return false;
    }

    currentPageRef.current = page;
    loadingPageRef.current = page;
    setLoadingMore(true);

    try {
      ws.send(JSON.stringify({ type: "load_page", page }));
      return true;
    } catch (error) {
      loadingPageRef.current = null;
      setLoadingMore(false);
      console.error("[loadPage] failed to request page:", page, error);
      return false;
    }
  }, []);

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
    loadingPageRef.current = null;
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
          totalPagesRef.current = Math.max(
            totalPagesRef.current,
            msg.total_pages ?? 1,
          );
          console.log("[ws] received historical page:", page, "| candles:", msg.data.length, "| total pages:", totalPagesRef.current);

          if (receivedPagesRef.current.has(page)) {
            console.warn("[ws] duplicate page, skipping:", page);
            if (loadingPageRef.current === page) {
              loadingPageRef.current = null;
              setLoadingMore(false);
            }
            return;
          }
          receivedPagesRef.current.add(page);

          setHistoricalData((previous) => {
            const byTime = new Map<number, StockTick>();
            previous.forEach((candle) => byTime.set(candle.time, candle));
            msg.data.forEach((candle) => byTime.set(candle.time, candle));
            return [...byTime.values()].sort((a, b) => a.time - b.time);
          });

          loadingPageRef.current = null;
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
        if (connectionId === connectionIdRef.current) {
          loadingPageRef.current = null;
          setLoadingMore(false);
          setConnected(false);
        }
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
  }, [ticker, interval, loadPage]);

  const loadPreviousPage = useCallback(() => {
    const loaded = receivedPagesRef.current;
    const maxPage = loaded.size ? Math.max(...loaded) : 1;
    const nextPage = maxPage + 1;

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
