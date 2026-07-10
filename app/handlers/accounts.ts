import { request } from "./auth";
import { AccountStats, JournalResponse, PnLCurveResponse, PnLPeriod } from "../types/accounts";

export async function fetchAccountStats(): Promise<AccountStats> {
  return request<AccountStats>("/api/account/stats", { method: "GET" });
}

export async function fetchJournal(month?: string): Promise<JournalResponse> {
  // month: "YYYY-MM", defaults to current month on the server if omitted
  const query = month ? `?month=${month}` : "";
  return request<JournalResponse>(`/api/account/journal${query}`, { method: "GET" });
}

export async function fetchPnLCurve(period: PnLPeriod = "month"): Promise<PnLCurveResponse> {
  return request<PnLCurveResponse>(`/api/account/pnl-curve?period=${period}`, { method: "GET" });
}
