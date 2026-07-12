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

export function runBacktest(
  ticker: string,
  interval: string,
  date_from: string,
  date_to: string,
  starting_balance: number,
) {
  return backtestRequest<BacktestResponse>("/api/backtest/run", {
    method: "POST",
    body: JSON.stringify({ ticker, interval, date_from, date_to, starting_balance }),
  });
}

export function listBacktests() {
  return backtestRequest<BacktestSummary[]>("/api/backtest/sessions");
}

export function getBacktestSession(sessionId: string) {
  return backtestRequest<BacktestResponse>(`/api/backtest/session/${sessionId}`);
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
