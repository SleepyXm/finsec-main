import { request } from "./auth";
import {
  normaliseStrategySnapshot,
  type WireStrategySnapshot,
} from "./annotations";
import type {
  StrategyDetails,
  StrategySnapshot,
} from "@/app/features/StrategyEngine/types";

export type MarketplaceStrategy = {
  id: string;
  title: string;
  description: string;
  author: string;
  official: boolean;
  snapshot_count: number;
  created_at: string;
  updated_at: string;
  preview: StrategySnapshot;
};

type MarketplaceDetails =
  Omit<MarketplaceStrategy, "preview"> & {
    snapshots: StrategySnapshot[];
  };

type WireMarketplaceStrategy =
  Omit<MarketplaceStrategy, "preview"> & {
    preview: WireStrategySnapshot;
  };

type WireMarketplaceDetails =
  Omit<MarketplaceDetails, "snapshots"> & {
    snapshots: WireStrategySnapshot[];
  };

export async function listMarketplaceStrategies() {
  const items = await request<WireMarketplaceStrategy[]>(
    "/api/marketplace/strategies",
    { method: "GET" },
  );
  return items.map((item) => ({
    ...item,
    preview: normaliseStrategySnapshot(item.preview),
  }));
}

export async function getMarketplaceStrategy(id: string) {
  const item = await request<WireMarketplaceDetails>(
    `/api/marketplace/strategies/${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  return {
    ...item,
    snapshots: item.snapshots.map(normaliseStrategySnapshot),
  };
}

export function setMarketplaceVisibility(
  id: string,
  published: boolean,
  description: string,
) {
  return request<{ id: string; published: boolean }>(
    `/api/user-annotations/${encodeURIComponent(id)}/marketplace`,
    {
      method: "PATCH",
      body: JSON.stringify({ published, description }),
    },
  );
}

const activeStrategyKey = "finsec.active-marketplace-strategy";

export function storeMarketplaceStrategy(strategy: StrategyDetails) {
  sessionStorage.setItem(activeStrategyKey, JSON.stringify(strategy));
}

export function loadMarketplaceStrategy() {
  const stored = sessionStorage.getItem(activeStrategyKey);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as StrategyDetails;
  } catch {
    sessionStorage.removeItem(activeStrategyKey);
    return null;
  }
}

export function clearMarketplaceStrategy() {
  sessionStorage.removeItem(activeStrategyKey);
}
