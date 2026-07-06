import { request } from "@/app/handlers/auth";
import { Trade, TradePatch } from "@/app/types/trades";


export async function fetchOpenPositions(): Promise<Trade[]> {
  return request("/api/positions", { method: "GET" });
}

export async function updateTrade(tradeId: string, patch: TradePatch): Promise<Trade> {
  const res = await request(`/api/trade/${tradeId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  return res.data;
}
