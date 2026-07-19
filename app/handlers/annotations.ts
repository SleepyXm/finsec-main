import { request } from "./auth";
import { Candle, RawData } from "@/app/types/charts";

export type AnnotationDraft = {
  label: string;
  timeStart: number;
  timeEnd: number;
  candles: Candle[];
};

export type StrategyAnnotation = {
  id: string;
  conceptId: string;
  label: string;
  kind: "candle_group" | "zone" | "level" | "marker";
  role: "structure" | "entry" | "exit" | "stop_loss" | "take_profit";
  importance: "required" | "preferred" | "informational";
  trigger: "presence" | "touch" | "cross" | "close_above" | "close_below" | "rejection";
  startRatio: number;
  endRatio: number;
  priceHigh?: number;
  priceLow?: number;
  price?: number;
  candleIndex?: number;
  priceAnchor?: "open" | "high" | "low" | "close";
};

export type AnnotationPayload = {
  symbol: string;
  label: string;
  timeStart: number;
  timeEnd: number;
  candles: Array<Pick<RawData, "open" | "high" | "low" | "close">>;
};

export type SavedStrategy = {
  id: string;
  title: string;
  snapshot_count: number;
  created_at: string;
  updated_at: string;
  preview: StrategySnapshot;
};

export type StrategySnapshot = {
  symbol: string;
  annotated_at: string;
  candles: Candle[];
  annotations: StrategyAnnotation[];
};

export type StrategyDetails = Omit<SavedStrategy, "preview"> & {
  snapshots: StrategySnapshot[];
};

function normaliseStrategySnapshot(snapshot: StrategySnapshot): StrategySnapshot {
  const candles = snapshot.candles.map((candle) => ({
    ...candle,
    volume: candle.volume ?? null,
    buy_price: candle.buy_price ?? null,
  }));
  return {
    ...snapshot,
    candles,
    annotations: (snapshot.annotations ?? []).map((annotation) => {
      if (annotation.kind !== "marker" || !candles.length) return annotation;
      const last = candles.length - 1;
      const candleIndex = Math.max(0, Math.min(last,
        annotation.candleIndex ?? Math.round(annotation.startRatio * last)));
      const candle = candles[candleIndex];
      const anchors = ["open", "high", "low", "close"] as const;
      const priceAnchor = annotation.priceAnchor ?? anchors.reduce((closest, anchor) =>
        Math.abs(candle[anchor] - (annotation.price ?? candle.close))
          < Math.abs(candle[closest] - (annotation.price ?? candle.close)) ? anchor : closest);
      const ratio = candleIndex / Math.max(1, last);
      return { ...annotation, candleIndex, priceAnchor, price: candle[priceAnchor], startRatio: ratio, endRatio: ratio };
    }),
  };
}

export function buildAnnotationPayload(
  annotation: AnnotationDraft,
  symbol: string,
): AnnotationPayload {
  if (annotation.candles.length === 0) {
    throw new Error("Select a candle range before saving the strategy.");
  }
  const anchor = annotation.candles[0].open;
  if (anchor === 0) {
    throw new Error("Cannot normalise a strategy snapshot with a zero opening price.");
  }

  return {
    symbol: symbol.toUpperCase(),
    label: annotation.label,
    timeStart: annotation.timeStart,
    timeEnd: annotation.timeEnd,
    candles: annotation.candles.map((candle) => ({
      open: Number((((candle.open - anchor) / anchor) * 100).toFixed(6)),
      high: Number((((candle.high - anchor) / anchor) * 100).toFixed(6)),
      low: Number((((candle.low - anchor) / anchor) * 100).toFixed(6)),
      close: Number((((candle.close - anchor) / anchor) * 100).toFixed(6)),
    })),
  };
}

export function saveUserAnnotation(payload: AnnotationPayload) {
  return request<{ id: string; title: string; snapshot_count: number }>(
    "/api/user-annotations",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function listUserStrategies() {
  const strategies = await request<SavedStrategy[]>("/api/user-annotations", { method: "GET" });
  return strategies.map((strategy) => ({
    ...strategy,
    preview: normaliseStrategySnapshot(strategy.preview),
  }));
}

export async function getUserStrategy(id: string) {
  const strategy = await request<StrategyDetails>(`/api/user-annotations/${id}`, {
    method: "GET",
  });
  return {
    ...strategy,
    snapshots: strategy.snapshots.map(normaliseStrategySnapshot),
  };
}

export function deleteUserStrategy(id: string) {
  return request<void>(`/api/user-annotations/${id}`, {
    method: "DELETE",
  });
}

export function deleteUserStrategySnapshot(id: string, index: number) {
  return request<{ remaining_snapshot_count: number }>(
    `/api/user-annotations/${id}/snapshots/${index}`,
    { method: "DELETE" },
  );
}

export function updateUserStrategySnapshotAnnotations(id: string, index: number, annotations: StrategyAnnotation[]) {
  return request<{ annotations: StrategyAnnotation[] }>(
    `/api/user-annotations/${id}/snapshots/${index}/annotations`,
    { method: "PUT", body: JSON.stringify({ annotations }) },
  );
}
