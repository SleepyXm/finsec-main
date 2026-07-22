import { StrategyAnnotation, StrategyDetails } from "@/app/components/handlers/annotations";
import { CandleStickChart } from "@/app/(pages)/chart/chartrender/charts/CandleStickChart";
import { ChartTheme } from "@/app/(pages)/chart/chartrender/themes/themes";
import { ActionPanel, cornerStyle, theme } from "@/app/UI";
import { useChartContext } from "@/app/(pages)/chart/chartcontext";
import { StrategyValidationControls } from "../SimilaritySearch/controls";
import { SnapshotTeachingSection } from "./SnapshotTeachingSection";

export function StrategySnapshotsPanel({
  strategy,
  onBack,
  onDeleteStrategy,
  onDeleteSnapshot,
  onSaveSnapshotAnnotations,
  deleting,
  error,
  chartTheme,
}: {
  strategy: StrategyDetails;
  onBack: () => void;
  onDeleteStrategy: () => void;
  onDeleteSnapshot: (index: number) => void;
  onSaveSnapshotAnnotations: (
    index: number,
    annotations: StrategyAnnotation[],
  ) => Promise<void>;
  deleting: boolean;
  error: string | null;
  chartTheme: ChartTheme;
}) {
  const {
    isCreatingStrategy,
    annotationStrategyLabel,
    annotationError,
    startAnnotation,
    stopAnnotation,
    validation,
    strategyTeaching,
  } = useChartContext();

  const isAnnotatingThis =
    isCreatingStrategy && annotationStrategyLabel === strategy.title;

  return (
    <div style={{ padding: 12 }}>
      <button
        type="button"
        onClick={() => {
          if (isAnnotatingThis) stopAnnotation();
          onBack();
        }}
        style={{
          border: 0,
          background: "transparent",
          color: theme.dark.muted,
          padding: 0,
          fontFamily: "inherit",
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        ← Strategies
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "start",
          gap: 8,
          marginTop: 14,
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: theme.dark.text, fontSize: 13 }}>
            {strategy.title.replace(/_/g, " ")}
          </div>

          <div style={{ color: theme.dark.muted2, fontSize: 10, marginTop: 3 }}>
            {strategy.snapshot_count}{" "}
            {strategy.snapshot_count === 1 ? "snapshot" : "snapshots"}
          </div>
        </div>

        <button
          type="button"
          disabled={deleting}
          onClick={() => {
            if (isAnnotatingThis) stopAnnotation();
            onDeleteStrategy();
          }}
          style={{
            border: 0,
            background: "transparent",
            color: theme.dark.errorText,
            padding: 0,
            fontFamily: "inherit",
            fontSize: 10,
            cursor: deleting ? "wait" : "pointer",
            opacity: deleting ? 0.45 : 1,
          }}
        >
          Delete strategy
        </button>
      </div>

      {(annotationError || error) && (
        <div
          style={{
            color: theme.dark.errorText,
            background: theme.dark.errorBg,
            padding: 9,
            fontSize: 10,
            marginBottom: 10,
          }}
        >
          {annotationError ?? error}
        </div>
      )}

      <ActionPanel
        title="Add snapshot"
        active={isAnnotatingThis}
        description={`The selection will be saved directly to ${strategy.title.replace(/_/g, " ")}.`}
        activeHint="Select at least five candles. No label choice is required."
        onToggle={() =>
          isAnnotatingThis ? stopAnnotation() : startAnnotation(strategy.title)
        }
        style={{ margin: "14px 0 10px" }}
      />

      <SnapshotTeachingSection
        strategy={strategy}
        onSave={onSaveSnapshotAnnotations}
      />

      <StrategyValidationControls strategy={strategy} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        {strategy.snapshots.map((snapshot, index) => {
          const selectedReference =
            validation.active &&
            validation.strategyId === strategy.id &&
            validation.candidate &&
            index === validation.candidate.referenceIndex;

          const snapshotAnnotations =
            strategyTeaching?.strategyId === strategy.id &&
            strategyTeaching.snapshotIndex === index
              ? strategyTeaching.annotations
              : snapshot.annotations;

          return (
            <article
              key={`${snapshot.annotated_at}-${index}`}
              style={{
                position: "relative",
                minWidth: 0,
                border: `1px solid ${
                  selectedReference ? theme.dark.accent : theme.dark.borderSoft
                }`,
                background: "var(--ui-card-subtle)",
              }}
            >
              <div style={cornerStyle()} />

              <div
                style={{
                  height: 96,
                  borderBottom: `1px solid ${theme.dark.borderSoft}`,
                  position: "relative",
                }}
              >
                <CandleStickChart
                  data={snapshot.candles}
                  minimal
                  theme={chartTheme}
                  semanticMarks={snapshotAnnotations.map((annotation) => ({ annotation }))}
                />
              </div>

              <div style={{ padding: "8px 9px 9px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, color: theme.dark.text, fontSize: 11 }}>
                    Snapshot {index + 1}
                  </div>

                  <button
                    type="button"
                    aria-label={`Delete snapshot ${index + 1}`}
                    disabled={deleting}
                    onClick={() => onDeleteSnapshot(index)}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: theme.dark.errorText,
                      padding: 0,
                      fontSize: 14,
                      cursor: deleting ? "wait" : "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ color: theme.dark.muted2, fontSize: 9, marginTop: 3 }}>
                  {snapshot.symbol} · {new Date(snapshot.annotated_at).toLocaleString()}
                </div>

                <div style={{ color: theme.dark.hint, fontSize: 8, marginTop: 3 }}>
                  {snapshot.annotations.length} semantic{" "}
                  {snapshot.annotations.length === 1 ? "mark" : "marks"}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
