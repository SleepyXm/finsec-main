import { request } from "./auth";
import type { Candle } from "@/app/components/types/charts";
import { candleRange } from "@/app/features/StrategyEngine/candleRange";
import type {
  AnnotationCandle,
  AnnotationDraft,
  SavedStrategy,
  StrategyAnnotation,
  StrategyDetails,
  StrategySnapshot,
} from "@/app/features/StrategyEngine/types";

export type {
  AnnotationCandle,
  AnnotationDraft,
  SavedStrategy,
  StrategyAnnotation,
  StrategyDetails,
  StrategySnapshot,
} from "@/app/features/StrategyEngine/types";

type WireAnnotation = {
  id: string;
  conceptId: string;
  label: string;
  kind: StrategyAnnotation["kind"];
  role: "structure" | "entry" | "exit" | "stop_loss" | "take_profit";
  importance: "required" | "preferred" | "informational";
  trigger: "presence" | "touch" | "cross" | "close_above" | "close_below" | "rejection";
  startIndex?: number;
  endIndex?: number;
  startRatio?: number;
  endRatio?: number;
  priceHigh?: number;
  priceLow?: number;
  price?: number;
  candleIndex?: number;
  priceAnchor?: "open" | "high" | "low" | "close";
  candles?: AnnotationCandle[];
};

export type AnnotationPayload = {
  symbol: string;
  label: string;
  timeStart: number;
  timeEnd: number;
  candles: AnnotationCandle[];
};

export type WireStrategySnapshot = {
  symbol: string;
  annotated_at: string;
  candles: Candle[];
  annotations?: WireAnnotation[];
};

type WireSavedStrategy = Omit<SavedStrategy, "preview"> & {
  preview: WireStrategySnapshot;
};

type WireStrategyDetails = Omit<StrategyDetails, "snapshots"> & {
  snapshots: WireStrategySnapshot[];
};

function normaliseRange(
  annotation: WireAnnotation,
  candles: Candle[],
) {
  if (!candles.length) return null;

  if (
    Number.isInteger(annotation.startIndex) &&
    Number.isInteger(annotation.endIndex)
  ) {
    return candleRange(
      annotation.startIndex!,
      annotation.endIndex!,
      candles.length,
    );
  }

  if (
    annotation.kind === "candle_group" &&
    annotation.candles?.length
  ) {
    const startIndex = candles.findIndex((_, index) =>
      index + annotation.candles!.length <= candles.length &&
      annotation.candles!.every((candle, offset) => {
        const source = candles[index + offset];

        return (
          source.open === candle.open &&
          source.high === candle.high &&
          source.low === candle.low &&
          source.close === candle.close
        );
      }),
    );

    if (startIndex >= 0) {
      return {
        startIndex,
        endIndex:
          startIndex + annotation.candles.length - 1,
      };
    }
  }

  if (
    typeof annotation.startRatio === "number" &&
    typeof annotation.endRatio === "number"
  ) {
    const last = candles.length - 1;

    return candleRange(
      Math.round(annotation.startRatio * last),
      Math.round(annotation.endRatio * last),
      candles.length,
    );
  }

  return null;
}

export function normaliseStrategySnapshot(
  snapshot: WireStrategySnapshot,
): StrategySnapshot {
  const candles = snapshot.candles.map((candle) => ({
    ...candle,
    volume: candle.volume ?? null,
    buy_price: candle.buy_price ?? null,
  }));

  return {
    ...snapshot,
    candles,
    annotations: (snapshot.annotations ?? []).flatMap(
      (annotation): StrategyAnnotation[] => {
        if (!candles.length) return [];

        const base = {
          id: annotation.id,
          conceptId: annotation.conceptId,
          label: annotation.label,
          role: annotation.role,
          importance: annotation.importance,
          trigger: annotation.trigger,
        };

        if (annotation.kind !== "marker") {
          const range = normaliseRange(
            annotation,
            candles,
          );

          if (!range) return [];

          if (annotation.kind === "candle_group") {
            return [{
              ...base,
              ...range,
              kind: "candle_group",
            }];
          }

          if (
            annotation.kind === "zone" &&
            typeof annotation.priceHigh === "number" &&
            typeof annotation.priceLow === "number"
          ) {
            return [{
              ...base,
              ...range,
              kind: "zone",
              priceHigh: annotation.priceHigh,
              priceLow: annotation.priceLow,
            }];
          }

          if (
            annotation.kind === "level" &&
            typeof annotation.price === "number"
          ) {
            return [{
              ...base,
              ...range,
              kind: "level",
              price: annotation.price,
            }];
          }

          return [];
        }

        const last = candles.length - 1;
        const candleIndex = Math.max(
          0,
          Math.min(
            last,
            annotation.candleIndex ??
              Math.round(
                (annotation.startRatio ?? 0) * last,
              ),
          ),
        );
        const candle = candles[candleIndex];
        const anchors = [
          "open",
          "high",
          "low",
          "close",
        ] as const;
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
          ...base,
          kind: "marker",
          candleIndex,
          priceAnchor,
          price: candle[priceAnchor],
        }];
      },
    ),
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
  const strategies = await request<WireSavedStrategy[]>("/api/user-annotations", { method: "GET" });
  return strategies.map((strategy) => ({
    ...strategy,
    preview: normaliseStrategySnapshot(strategy.preview),
  }));
}

export async function getUserStrategy(id: string) {
  const strategy = await request<WireStrategyDetails>(`/api/user-annotations/${id}`, { method: "GET" });
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
