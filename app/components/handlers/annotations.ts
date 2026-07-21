import { request } from "./auth";
import { Candle } from "@/app/components/types/charts";

export type AnnotationDraft = {
  label: string;
  timeStart: number;
  timeEnd: number;
  candles: Candle[];
};

// Plain OHLC — no time, volume, or buy_price. Used for persisted candle_group candles.
export type AnnotationCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
};

type AnnotationBase = {
  id: string;
  conceptId: string;
  label: string;
  role: "structure" | "entry" | "exit" | "stop_loss" | "take_profit";
  importance: "required" | "preferred" | "informational";
  trigger: "presence" | "touch" | "cross" | "close_above" | "close_below" | "rejection";
};

export type StrategyAnnotation =
  | (AnnotationBase & { kind: "candle_group"; candles: AnnotationCandle[] })
  | (AnnotationBase & { kind: "zone"; startRatio: number; endRatio: number; priceHigh: number; priceLow: number })
  | (AnnotationBase & { kind: "level"; startRatio: number; endRatio: number; price: number })
  | (AnnotationBase & { kind: "marker"; candleIndex: number; priceAnchor: "open" | "high" | "low" | "close"; price: number });

export type AnnotationPayload = {
  symbol: string;
  label: string;
  timeStart: number;
  timeEnd: number;
  candles: AnnotationCandle[];
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
    annotations: (snapshot.annotations ?? []).flatMap((annotation): StrategyAnnotation[] => {
  if (!candles.length) return [];

  if (annotation.kind === "candle_group") {
    if (Array.isArray(annotation.candles) && annotation.candles.length > 0) {
      return [annotation];
    }

    const legacy = annotation as unknown as {
      startRatio?: number;
      endRatio?: number;
    };

    if (
      typeof legacy.startRatio !== "number" ||
      typeof legacy.endRatio !== "number"
    ) {
      return [];
    }

    const last = candles.length - 1;

    const start = Math.round(
      Math.max(
        0,
        Math.min(1, Math.min(legacy.startRatio, legacy.endRatio)),
      ) * last,
    );

    const end = Math.round(
      Math.max(
        0,
        Math.min(1, Math.max(legacy.startRatio, legacy.endRatio)),
      ) * last,
    );

    const selected = candles
      .slice(start, end + 1)
      .map(({ open, high, low, close }) => ({
        open,
        high,
        low,
        close,
      }));

    if (!selected.length) return [];

    return [{
      id: annotation.id,
      conceptId: annotation.conceptId,
      label: annotation.label,
      kind: "candle_group",
      role: annotation.role,
      importance: annotation.importance,
      trigger: annotation.trigger,
      candles: selected,
    }];
  }

  if (annotation.kind !== "marker") {
    return [annotation];
  }

  const last = candles.length - 1;

  const legacyRatio = (
    annotation as unknown as { startRatio?: number }
  ).startRatio;

  const candleIndex = Math.max(
    0,
    Math.min(
      last,
      annotation.candleIndex ??
        Math.round((legacyRatio ?? 0) * last),
    ),
  );

  const candle = candles[candleIndex];
  const anchors = ["open", "high", "low", "close"] as const;

  const priceAnchor =
    annotation.priceAnchor ??
    anchors.reduce((closest, anchor) =>
      Math.abs(
        candle[anchor] -
          (annotation.price ?? candle.close),
      ) <
      Math.abs(
        candle[closest] -
          (annotation.price ?? candle.close),
      )
        ? anchor
        : closest,
    );

  return [{
    ...annotation,
    candleIndex,
    priceAnchor,
    price: candle[priceAnchor],
  }];
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
    { method: "POST", body: JSON.stringify(payload) },
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
  const strategy = await request<StrategyDetails>(`/api/user-annotations/${id}`, { method: "GET" });
  return {
    ...strategy,
    snapshots: strategy.snapshots.map(normaliseStrategySnapshot),
  };
}

export function deleteUserStrategy(id: string) {
  return request<void>(`/api/user-annotations/${id}`, { method: "DELETE" });
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