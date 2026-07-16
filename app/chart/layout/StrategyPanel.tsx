"use client";

import { useCallback, useEffect, useState } from "react";
import { useChartContext } from "../chartcontext";
import {
  deleteUserStrategy,
  deleteUserStrategySnapshot,
  getUserStrategy,
  listUserStrategies,
  type SavedStrategy,
  type StrategyDetails,
} from "@/app/handlers/annotations";
import { useUser } from "@/app/provider/userprovider";
import { cornerStyle, theme } from "@/app/ui";
import { CandleStickChart } from "@/app/chart/chartrender/charts/CandleStickChart";
import type { ChartTheme } from "@/app/chart/chartrender/themes/themes";
import { StrategySnapshotsPanel } from "./StrategySnapshotsPanel";

const idleBackground = "rgba(238,242,247,0.025)";

export default function StrategyPanel({ chartTheme }: { chartTheme: ChartTheme }) {
  const {
    isCreatingStrategy,
    setIsCreatingStrategy,
    annotations,
    annotationError,
  } = useChartContext();
  const { user, resolved } = useUser();
  const [items, setItems] = useState<SavedStrategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyDetails | null>(null);
  const [loadingStrategyId, setLoadingStrategyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStrategies = useCallback(async () => {
    if (!user) {
      setItems([]);
      setSelectedStrategy(null);
      return;
    }
    setLoading(true);
    try {
      setItems(await listUserStrategies());
      setLoadError(null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Failed to load strategies");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (resolved) void loadStrategies();
  }, [resolved, loadStrategies, annotations.length]);

  const openStrategy = async (strategy: SavedStrategy) => {
    setLoadingStrategyId(strategy.id);
    setLoadError(null);
    try {
      setSelectedStrategy(await getUserStrategy(strategy.id));
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Failed to load strategy snapshots");
    } finally {
      setLoadingStrategyId(null);
    }
  };

  const deleteStrategySet = async () => {
    if (!selectedStrategy) return;
    setDeleting(true);
    setLoadError(null);
    try {
      await deleteUserStrategy(selectedStrategy.id);
      setSelectedStrategy(null);
      await loadStrategies();
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Failed to delete strategy");
    } finally {
      setDeleting(false);
    }
  };

  const deleteSnapshot = async (index: number) => {
    if (!selectedStrategy) return;
    setDeleting(true);
    setLoadError(null);
    try {
      const result = await deleteUserStrategySnapshot(selectedStrategy.id, index);
      if (result.remaining_snapshot_count === 0) {
        setSelectedStrategy(null);
      } else {
        setSelectedStrategy((current) => current ? {
          ...current,
          snapshot_count: result.remaining_snapshot_count,
          snapshots: current.snapshots.filter((_, snapshotIndex) => snapshotIndex !== index),
        } : null);
      }
      await loadStrategies();
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Failed to delete snapshot");
    } finally {
      setDeleting(false);
    }
  };

  if (selectedStrategy) {
    return (
      <StrategySnapshotsPanel
        strategy={selectedStrategy}
        onBack={() => setSelectedStrategy(null)}
        onDeleteStrategy={() => void deleteStrategySet()}
        onDeleteSnapshot={(index) => void deleteSnapshot(index)}
        deleting={deleting}
        error={loadError}
        chartTheme={chartTheme}
      />
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <p style={{ color: theme.dark.muted2, fontSize: 11, marginBottom: 12, letterSpacing: "0.03em" }}>
        Mark a candle range and save it under a strategy label
      </p>

      {!resolved ? (
        <p style={{ color: theme.dark.muted2, fontSize: 11 }}>Checking your account…</p>
      ) : !user ? (
        <div style={{ color: theme.dark.muted2, fontSize: 11, padding: "10px 0" }}>
          Sign in to create and view your strategies.
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsCreatingStrategy(!isCreatingStrategy)}
          style={{
            width: "100%",
            padding: "10px 0",
            background: isCreatingStrategy ? "#7c3aed" : idleBackground,
            border: `1px solid ${isCreatingStrategy ? "#7c3aed" : theme.dark.borderSoft}`,
            borderRadius: 0,
            color: isCreatingStrategy ? "#fff" : theme.dark.muted,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: "0.03em",
          }}
        >
          {isCreatingStrategy ? "Stop annotating" : "Start annotating"}
        </button>
      )}

      {isCreatingStrategy && user && (
        <p style={{ color: "#a78bfa", fontSize: 11, marginTop: 8 }}>
          Drag across at least five candles, then choose a label.
        </p>
      )}

      {(annotationError || loadError) && (
        <div style={{ color: theme.dark.errorText, background: theme.dark.errorBg, padding: 9, fontSize: 10, marginTop: 10 }}>
          {annotationError ?? loadError}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <p style={{ color: theme.dark.muted2, fontSize: 11, marginBottom: 8, letterSpacing: "0.03em" }}>
          Saved strategies
        </p>

        {loading && items.length === 0 ? (
          <p style={{ color: theme.dark.muted2, fontSize: 11 }}>Loading strategies…</p>
        ) : user && items.length === 0 ? (
          <p style={{ color: theme.dark.muted2, fontSize: 11 }}>No saved strategies yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {items.map((strategy) => (
              <button
                key={strategy.id}
                type="button"
                aria-label={`View ${strategy.title.replace(/_/g, " ")} snapshots`}
                disabled={loadingStrategyId !== null}
                onClick={() => void openStrategy(strategy)}
                style={{
                  position: "relative",
                  minWidth: 0,
                  padding: 0,
                  border: `1px solid ${theme.dark.borderSoft}`,
                  background: idleBackground,
                  color: "inherit",
                  textAlign: "left",
                  fontFamily: "inherit",
                  cursor: loadingStrategyId === null ? "pointer" : "wait",
                  opacity: loadingStrategyId !== null && loadingStrategyId !== strategy.id ? 0.45 : 1,
                }}
              >
                <div style={cornerStyle()} />
                <div style={{ height: 96, borderBottom: `1px solid ${theme.dark.borderSoft}` }}>
                  <CandleStickChart data={strategy.preview.candles} minimal theme={chartTheme} />
                </div>
                <div style={{ padding: "8px 9px 9px" }}>
                  <div style={{ color: theme.dark.text, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {strategy.title.replace(/_/g, " ")}
                  </div>
                  <div style={{ color: theme.dark.muted2, fontSize: 9, marginTop: 3 }}>
                    {strategy.snapshot_count} {strategy.snapshot_count === 1 ? "snapshot" : "snapshots"} · {strategy.preview.symbol}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
