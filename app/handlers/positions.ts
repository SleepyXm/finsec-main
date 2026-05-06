import { Trade } from "@/app/types/trades";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE2;

export async function fetchOpenPositions(): Promise<Trade[]> {
  const res = await fetch(`${BACKEND_URL}/api/positions`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch positions: ${res.status}`);
  return res.json();
}