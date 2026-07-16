import { request } from "./auth";

export type AnnotationCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type AnnotationDraft = {
  label: string;
  timeStart: number;
  timeEnd: number;
  candles: AnnotationCandle[];
};

export type AnnotationPayload = {
  symbol: string;
  label: string;
  timeStart: number;
  timeEnd: number;
  candles: Array<Omit<AnnotationCandle, "time">>;
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
  candles: AnnotationCandle[];
};

export type StrategyDetails = Omit<SavedStrategy, "preview"> & {
  snapshots: StrategySnapshot[];
};

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

export function saveAnnotation(payload: AnnotationPayload) {
  return request("/api/annotations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

export function listUserStrategies() {
  return request<SavedStrategy[]>("/api/user-annotations", { method: "GET" });
}

export function getUserStrategy(id: string) {
  return request<StrategyDetails>(`/api/user-annotations/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

export function deleteUserStrategy(id: string) {
  return request<void>(`/api/user-annotations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function deleteUserStrategySnapshot(id: string, index: number) {
  return request<{ remaining_snapshot_count: number }>(
    `/api/user-annotations/${encodeURIComponent(id)}/snapshots/${index}`,
    { method: "DELETE" },
  );
}
