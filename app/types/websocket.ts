const WS_BASE = process.env.NEXT_PUBLIC_WS_API_BASE2;

export type StockTick = {
  ticker: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  buy_price: number;
  error?: string;
};

export type PositionClosedEvent = {
  type: "position_closed";
  data: {
    position_id: string;
    symbol: string;
    pnl: number;
    reason: string;
  };
};

export type AccountPnLEvent = {
  type: "account_pnl";
  data: {
    account_id: string;
    unrealised_pnl: number;
  };
};

export type HistoricalData = {
  type: "historical";
  data: StockTick[];
}

export type WSMessage = StockTick | HistoricalData | PositionClosedEvent | AccountPnLEvent;

export function createStockSocket(
  ticker: string,
  interval: string = "1m",
  onMessage: (msg: WSMessage) => void,
  onClose?: () => void
): WebSocket {
  const ws = new WebSocket(
    `${WS_BASE}/ws/stockdata?ticker_symbol=${encodeURIComponent(ticker)}&interval=${interval}`
  );

  ws.onmessage = async (event) => {
  try {
    let raw = event.data;

    if (raw instanceof Blob) {
      raw = await raw.text();
    }

    const msg: WSMessage = JSON.parse(raw);
    onMessage(msg);
  } catch {
    console.error("Failed to parse WS message:", event.data);
  }
};

  ws.onclose = () => onClose?.();

  return ws;
}