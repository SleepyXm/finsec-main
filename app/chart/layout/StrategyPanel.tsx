"use client";

import { useCallback, useEffect, useState } from "react";
import { useChartContext } from "../chartcontext";
import {
  deleteUserStrategy, deleteUserStrategySnapshot, getUserStrategy, listUserStrategies,
  SavedStrategy, StrategyAnnotation, StrategyDetails, updateUserStrategySnapshotAnnotations,
} from "@/app/handlers/annotations";
import { useUser } from "@/app/provider/userprovider";
import { cornerStyle, MonoLabel, theme, traderInsetPanelStyle, TraderBlankButton } from "@/app/ui";
import { CandleStickChart } from "@/app/chart/chartrender/charts/CandleStickChart";
import { ChartTheme } from "@/app/chart/chartrender/themes/themes";
import { StrategySnapshotsPanel } from "./StrategySnapshotsPanel";

const idleBackground = "rgba(238,242,247,0.025)";

export default function StrategyPanel({ chartTheme }: { chartTheme: ChartTheme }) {
  const {
    isCreatingStrategy,
    annotationStrategyLabel,
    startAnnotation,
    stopAnnotation,
    annotations,
    annotationError,
    openStrategyTeaching,
    closeStrategyTeaching,
    setStrategyTeachingAnnotations,
  } = useChartContext();
  const { user, resolved } = useUser();
  const [items, setItems] = useState<SavedStrategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyDetails | null>(null);
  const [loadingStrategyId, setLoadingStrategyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isGenericAnnotating = isCreatingStrategy && annotationStrategyLabel === null;
  const selectedStrategyId = selectedStrategy?.id;

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

  useEffect(() => {
    if (!selectedStrategyId || annotations.length === 0) return;

    let cancelled = false;
    void getUserStrategy(selectedStrategyId)
      .then((strategy) => {
        if (!cancelled) {
          setSelectedStrategy(strategy);
          const latest = strategy.snapshots.length - 1;
          if (strategy.snapshots[latest]) openStrategyTeaching(strategy.id, latest, strategy.snapshots[latest]);
        }
      })
      .catch((cause) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Failed to refresh strategy snapshots");
      });

    return () => {
      cancelled = true;
    };
  }, [annotations.length, openStrategyTeaching, selectedStrategyId]);

  const openStrategy = async (strategy: SavedStrategy) => {
    setLoadingStrategyId(strategy.id);
    setLoadError(null);
    try {
      const details = await getUserStrategy(strategy.id);
      setSelectedStrategy(details);
      if (details.snapshots[0]) openStrategyTeaching(details.id, 0, details.snapshots[0]);
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
      closeStrategyTeaching();
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
        closeStrategyTeaching();
        setSelectedStrategy(null);
      } else {
        const nextSnapshots = selectedStrategy.snapshots.filter((_, snapshotIndex) => snapshotIndex !== index);
        const nextIndex = Math.min(index, nextSnapshots.length - 1);
        setSelectedStrategy((current) => current ? {
          ...current,
          snapshot_count: result.remaining_snapshot_count,
          snapshots: nextSnapshots,
        } : null);
        if (nextSnapshots[nextIndex]) openStrategyTeaching(selectedStrategy.id, nextIndex, nextSnapshots[nextIndex]);
      }
      await loadStrategies();
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Failed to delete snapshot");
    } finally {
      setDeleting(false);
    }
  };

  const saveSnapshotAnnotations = async (index: number, next: StrategyAnnotation[]) => {
    if (!selectedStrategy) return;
    const result = await updateUserStrategySnapshotAnnotations(selectedStrategy.id, index, next);
    setStrategyTeachingAnnotations(result.annotations);
    setSelectedStrategy((current) => current ? {
      ...current,
      snapshots: current.snapshots.map((snapshot, snapshotIndex) =>
        snapshotIndex === index ? { ...snapshot, annotations: result.annotations } : snapshot),
    } : current);
  };

  if (selectedStrategy) {
    return (
      <StrategySnapshotsPanel
        strategy={selectedStrategy}
        onBack={() => { closeStrategyTeaching(); setSelectedStrategy(null); }}
        onDeleteStrategy={() => void deleteStrategySet()}
        onDeleteSnapshot={(index) => void deleteSnapshot(index)}
        onSaveSnapshotAnnotations={saveSnapshotAnnotations}
        deleting={deleting}
        error={loadError}
        chartTheme={chartTheme}
      />
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <section style={{ ...traderInsetPanelStyle(theme.dark), marginBottom: 16 }}>
        <div style={cornerStyle()} />
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "9px 10px", borderBottom: `1px solid ${theme.dark.borderSoft}`,
        }}>
          <MonoLabel>New strategy snapshot</MonoLabel>
          <span style={{
            color: isGenericAnnotating ? theme.dark.accent : theme.dark.muted2,
            fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            {isGenericAnnotating ? "Annotating" : "Ready"}
          </span>
        </header>

        <div style={{ padding: 10 }}>
          {!resolved ? (
            <div style={{ color: theme.dark.muted2, fontSize: 10 }}>Checking your account…</div>
          ) : !user ? (
            <div style={{ color: theme.dark.muted2, fontSize: 10 }}>
              Sign in to create and view your strategies.
            </div>
          ) : (
            <>
              <div style={{ color: theme.dark.muted2, fontSize: 10, marginBottom: 9 }}>
                Draw a candle range, then choose its strategy label.
              </div>
              <TraderBlankButton
                active={isGenericAnnotating}
                onClick={() => isGenericAnnotating ? stopAnnotation() : startAnnotation()}
                style={{ width: "100%", padding: "8px 10px", fontSize: 10, letterSpacing: "0.04em" }}
              >
                {isGenericAnnotating ? "Stop annotating" : "Start annotating"}
              </TraderBlankButton>
              {isGenericAnnotating && (
                <div style={{ color: theme.dark.accent, fontSize: 9, marginTop: 8 }}>
                  Select at least five candles.
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {(annotationError || loadError) && (
        <div style={{ color: theme.dark.errorText, background: theme.dark.errorBg, padding: 9, fontSize: 10, marginBottom: 12 }}>
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
