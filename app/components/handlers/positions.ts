import { request } from "@/app/components/handlers/auth";
import { Trade, TradePatch } from "@/app/components/types/trades";


export async function fetchOpenPositions(): Promise<Trade[]> {
  return request<Trade[]>("/api/positions", { method: "GET" });
}

export async function updateTrade(tradeId: string, patch: TradePatch): Promise<Trade> {
  const res = await request<{ data: Trade }>(`/api/trade/${tradeId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  return res.data;
}
