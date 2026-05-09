import { Portfolio } from "../types/portfolio";

const BACKEND_URL = "http://localhost:9000/api";

export async function fetchPortfolio(): Promise<Portfolio> {
  const res = await fetch(`${BACKEND_URL}/portfolio`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch portfolio: ${res.status}`);
  return res.json();
}