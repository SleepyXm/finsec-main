import type {
  BacktestPosition,
  BacktestResponse,
  BacktestSummary,
} from "@/app/types/backend";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE2;

async function backtestRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Backtest request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function normaliseBacktestResponse(response: BacktestResponse): BacktestResponse {
  return {
    ...response,
    candles: response.candles.map((candle) => ({
      ...candle,
      volume: candle.volume ?? null,
      buy_price: candle.buy_price ?? null,
    })),
  };
}

export async function runBacktest(
  ticker: string,
  interval: string,
  date_from: string,
  date_to: string,
  starting_balance: number,
) {
  const response = await backtestRequest<BacktestResponse>("/api/backtest/run", {
    method: "POST",
    body: JSON.stringify({ ticker, interval, date_from, date_to, starting_balance }),
  });
  return normaliseBacktestResponse(response);
}

export function listBacktests() {
  return backtestRequest<BacktestSummary[]>("/api/backtest/sessions");
}

export async function getBacktestSession(sessionId: string) {
  const response = await backtestRequest<BacktestResponse>(`/api/backtest/session/${sessionId}`);
  return normaliseBacktestResponse(response);
}

export function saveBacktestSession(
  sessionId: string,
  currentCandle: number,
  positions: BacktestPosition[],
) {
  return backtestRequest<void>(`/api/backtest/session/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ current_candle: currentCandle, positions }),
  });
}

export function deleteBacktestSession(sessionId: string) {
  return backtestRequest<void>(`/api/backtest/session/${sessionId}`, { method: "DELETE" });
}
