import { request } from "./auth";
import { TradeCursor, PortfolioPage } from "../types/portfolio";

export async function fetchPortfolioPage(
  cursor?: TradeCursor,
  limit = 20,
): Promise<PortfolioPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    params.set("cursor_time", cursor.cursor_time);
    params.set("cursor_id", cursor.cursor_id);
  }
  return request<PortfolioPage>(`/api/portfolio?${params}`, { method: "GET" });
}
