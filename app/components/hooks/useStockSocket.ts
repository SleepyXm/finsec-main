import { useEffect, useRef, useState, useCallback } from "react";
import { createStockSocket, StockTick, WSMessage } from "@/app/components/types/websocket";
import { Trade } from "@/app/components/types/trades";

export type ChartLoadState = "connecting" | "preparing" | "ready" | "error";

const MAX_RECONNECT_ATTEMPTS = 10;

export function useStockSocket(
  ticker: string,
  interval: string = "1m",
  positions: Trade[],
  onPositionClosed: (tradeId: string) => void,
  onAccountPnL: (unrealised: number) => void,
) {
  const seriesKey = `${ticker}:${interval}`;
  const [tickState, setTickState] = useState<{ key: string; data: StockTick | null }>({
    key: "", data: null,
  });
  const [historyState, setHistoryState] = useState<{ key: string; data: StockTick[] }>({
    key: "", data: [],
  });
  const [connected, setConnected] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadState, setLoadState] = useState<{ key: string; state: ChartLoadState }>({
    key: "", state: "connecting",
  });
  const [retryGeneration, setRetryGeneration] = useState(0);
  const tick = tickState.key === seriesKey ? tickState.data : null;
  const historicalData = historyState.key === seriesKey ? historyState.data : [];
  const chartLoadState = loadState.key === seriesKey ? loadState.state : "connecting";

  const wsRef = useRef<WebSocket | null>(null);
  const connectionIdRef = useRef(0);
  const seriesKeyRef = useRef("");
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
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

    const seriesChanged = seriesKeyRef.current !== seriesKey;
    if (seriesChanged) {
      seriesKeyRef.current = seriesKey;
      retryCountRef.current = 0;
    }

    // increment first — this is the ID for this connection
    connectionIdRef.current += 1;
    const connectionId = connectionIdRef.current;
    let disposed = false;

    const scheduleReconnect = () => {
      if (
        disposed || connectionId !== connectionIdRef.current ||
        retryTimerRef.current !== null
      ) return;
      if (retryCountRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setLoadState({ key: seriesKey, state: "error" });
        return;
      }

      const delay = Math.min(1_000 * 2 ** retryCountRef.current, 10_000);
      retryCountRef.current += 1;
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        setRetryGeneration((current) => current + 1);
      }, delay);
    };

    // close previous socket synchronously before opening a new one
    if (wsRef.current) {
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // reset all per-connection state
    loadingPageRef.current = null;
    if (seriesChanged) {
      currentPageRef.current = 1;
      receivedPagesRef.current = new Set();
      totalPagesRef.current = 1;
    }

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

          setHistoryState((current) => {
            const byTime = new Map<number, StockTick>();
            if (current.key === seriesKey) {
              current.data.forEach((candle) => byTime.set(candle.time, candle));
            }
            msg.data.forEach((candle) => byTime.set(candle.time, candle));
            return {
              key: seriesKey,
              data: [...byTime.values()].sort((a, b) => a.time - b.time),
            };
          });

          loadingPageRef.current = null;
          setLoadingMore(false);
          retryCountRef.current = 0;
          setLoadState({ key: seriesKey, state: msg.data.length ? "ready" : "error" });

          return;
        }

        if ("type" in msg && msg.type === "downloading") {
          setLoadingMore(false);
          setLoadState({ key: seriesKey, state: "preparing" });
          scheduleReconnect();
          wsRef.current?.close();
          return;
        }

        if ("type" in msg && msg.type === "account_pnl") {
          onAccountPnL(msg.data.unrealised_pnl);
          return;
        }

        const priceTick = msg as StockTick;
        if (priceTick.ticker !== ticker) return;
        setTickState({ key: seriesKey, data: priceTick });
      },
      () => {
        if (connectionId === connectionIdRef.current) {
          loadingPageRef.current = null;
          setLoadingMore(false);
          setConnected(false);
          scheduleReconnect();
        }
      },
    );

    ws.onopen = () => {
      if (connectionId === connectionIdRef.current) {
        setConnected(true);
        setLoadingMore(false);
      }
    };
    ws.onerror = () => {
      if (connectionId === connectionIdRef.current) ws.close();
    };

    wsRef.current = ws;

    // cleanup: just close the socket, never touch connectionIdRef here
    return () => {
      disposed = true;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      ws.onmessage = null;
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
    };
  }, [ticker, interval, loadPage, retryGeneration, onAccountPnL, onPositionClosed, seriesKey]);

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

  return {
    tick, historicalData, connected, chartLoadState, livePnLMap,
    loadingMore, loadPage, loadPreviousPage,
  };
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
