import { BacktestResponse } from "@/app/types/backend";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE2;

export async function runBacktest(
  ticker: string,
  interval: string,
  date_from: string,
  date_to: string,
  starting_balance: number,
): Promise<BacktestResponse> {
  const res = await fetch(`${BACKEND_URL}/api/backtest/run`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, interval, date_from, date_to, starting_balance }),
  });
  if (!res.ok) throw new Error(`Backtest failed: ${res.status}`);
  return res.json();
}

export async function deleteBacktestSession(session_id: string): Promise<void> {
  await fetch(`${BACKEND_URL}/api/backtest/session/${session_id}`, {
    method: "DELETE",
    credentials: "include",
  });
}