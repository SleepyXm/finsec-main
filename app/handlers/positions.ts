import { Trade } from "@/app/types/trades";

const BACKEND_URL = "http://localhost:9000/api";

export async function fetchOpenPositions(): Promise<Trade[]> {
  const res = await fetch(`${BACKEND_URL}/positions`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch positions: ${res.status}`);
  return res.json();
}