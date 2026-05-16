import { PositionCursor, PortfolioPage, Portfolio } from "../types/portfolio";

const BACKEND_URL = "http://localhost:9000/api";

export async function fetchPortfolio(): Promise<Portfolio> {
  const res = await fetch(`${BACKEND_URL}/portfolio`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch portfolio: ${res.status}`);
  return res.json();
}

export async function fetchPortfolioPage(
  cursor?: PositionCursor,
  limit = 20,
): Promise<PortfolioPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    params.set("cursor_time", cursor.cursor_time);
    params.set("cursor_id", cursor.cursor_id);
  }
  const res = await fetch(`${BACKEND_URL}/portfolio?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch portfolio page: ${res.status}`);
  return res.json();
}