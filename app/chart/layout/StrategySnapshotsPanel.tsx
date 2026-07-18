import { StrategyAnnotation, StrategyDetails } from "@/app/handlers/annotations";
import { CandleStickChart } from "@/app/chart/chartrender/charts/CandleStickChart";
import { ChartTheme } from "@/app/chart/chartrender/themes/themes";
import { cornerStyle, MonoLabel, theme, traderInsetPanelStyle, TraderBlankButton } from "@/app/ui";
import { useChartContext } from "@/app/chart/chartcontext";
import { SnapshotTeachingSection } from "./SnapshotTeachingSection";
import { strategyCardBackground, StrategyCaptureSection } from "./StrategyCaptureSection";

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
  onSaveSnapshotAnnotations: (index: number, annotations: StrategyAnnotation[]) => Promise<void>;
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
    startValidation,
    stopValidation,
    acceptCandidate,
    rejectCandidate,
    adjustCandidateBoundary,
    chartData,
    strategyTeaching,
  } = useChartContext();
  const isValidatingThis = validation.active && validation.strategyId === strategy.id;
  const isAnnotatingThis = isCreatingStrategy && annotationStrategyLabel === strategy.title;
  const refSnapshot = strategy.snapshots[strategy.snapshots.length - 1];
  const usesSnapshotAggregate = strategy.snapshots.length >= 4;
  const snapshotLengths = strategy.snapshots.map((snapshot) => snapshot.candles.length);
  const aggregateMinLength = usesSnapshotAggregate ? Math.min(...snapshotLengths) : 0;
  const aggregateMaxLength = usesSnapshotAggregate ? Math.max(...snapshotLengths) : 0;
  const candidateCandles = validation.active ? validation.candidate?.candles : undefined;
  const candidateStartIndex = candidateCandles
    ? chartData.findIndex((candle) => candle.time === candidateCandles[0].time)
    : -1;
  const candidateEndIndex = candidateCandles
    ? chartData.findIndex((candle) => candle.time === candidateCandles[candidateCandles.length - 1].time)
    : -1;
  const canTrimCandidate = (candidateCandles?.length ?? 0) > 5;
  const validationStatus = !validation.active || validation.strategyId !== strategy.id
    ? "Ready"
    : validation.candidate
      ? "Match found"
      : validation.done
        ? "Complete"
        : validation.historyRequest
          ? "Loading history"
          : "Scanning";

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

      <div style={{ display: "flex", alignItems: "start", gap: 8, marginTop: 14, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: theme.dark.text, fontSize: 13 }}>
            {strategy.title.replace(/_/g, " ")}
          </div>
          <div style={{ color: theme.dark.muted2, fontSize: 10, marginTop: 3 }}>
            {strategy.snapshot_count} {strategy.snapshot_count === 1 ? "snapshot" : "snapshots"}
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
        <div style={{ color: theme.dark.errorText, background: theme.dark.errorBg, padding: 9, fontSize: 10, marginBottom: 10 }}>
          {annotationError ?? error}
        </div>
      )}

      <StrategyCaptureSection
        title="Add snapshot"
        active={isAnnotatingThis}
        description={`The selection will be saved directly to ${strategy.title.replace(/_/g, " ")}.`}
        activeHint="Select at least five candles. No label choice is required."
        onToggle={() => isAnnotatingThis ? stopAnnotation() : startAnnotation(strategy.title)}
        style={{ margin: "14px 0 10px" }}
      />

      <SnapshotTeachingSection strategy={strategy} onSave={onSaveSnapshotAnnotations} />

      <section style={{
        ...traderInsetPanelStyle(theme.dark),
        margin: "10px 0 14px",
        borderColor: isValidatingThis ? theme.dark.accentBorder : theme.dark.borderSoft,
      }}>
        <div style={cornerStyle()} />
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "9px 10px", borderBottom: `1px solid ${theme.dark.borderSoft}`,
        }}>
          <MonoLabel>Validation scan</MonoLabel>
          <span style={{
            color: validation.active && validation.candidate ? theme.dark.successText : isValidatingThis ? theme.dark.accent : theme.dark.muted2,
            fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            {validationStatus}
          </span>
        </header>

        {!isValidatingThis ? (
          <div style={{ padding: 10 }}>
            <div style={{ color: theme.dark.muted2, fontSize: 10, marginBottom: 9 }}>
              {usesSnapshotAggregate
                ? `${strategy.snapshots.length}-snapshot aggregate · ${aggregateMinLength}–${aggregateMaxLength} candles`
                : `Latest snapshot · ${refSnapshot?.candles.length ?? 0} candles`}
            </div>
            <TraderBlankButton
              active
              disabled={!refSnapshot}
              onClick={() => refSnapshot && startValidation(
                strategy.id,
                strategy.title,
                strategy.snapshots,
              )}
              style={{ width: "100%", padding: "8px 10px", fontSize: 10, letterSpacing: "0.04em" }}
            >
              Scan history
            </TraderBlankButton>
          </div>
        ) : (
          <div style={{ padding: 10 }}>
            <div style={{ color: theme.dark.muted2, fontSize: 9, marginBottom: 8 }}>
              {validation.aggregate
                ? `${validation.references.length}-snapshot aggregate · ${validation.minLength}–${validation.maxLength} candles`
                : `Latest snapshot · ${validation.references[0].candles.length} candles`}
            </div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              color: theme.dark.muted2, fontSize: 9, marginBottom: 10,
            }}>
              <span>History scanned</span>
              <span style={{ color: theme.dark.text }}>
                {Math.min(validation.scanned, validation.available)} / {validation.available}
              </span>
            </div>
            {validation.candidate ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ color: theme.dark.muted2, fontSize: 9 }}>
                  Selected range · {validation.candidate.candles.length} candles
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <TraderBlankButton
                    disabled={candidateStartIndex <= 0}
                    onClick={() => adjustCandidateBoundary("start", -1)}
                    style={{ padding: "6px 7px", fontSize: 9 }}
                  >
                    ← Extend start
                  </TraderBlankButton>
                  <TraderBlankButton
                    disabled={!canTrimCandidate}
                    onClick={() => adjustCandidateBoundary("start", 1)}
                    style={{ padding: "6px 7px", fontSize: 9 }}
                  >
                    Trim start →
                  </TraderBlankButton>
                  <TraderBlankButton
                    disabled={!canTrimCandidate}
                    onClick={() => adjustCandidateBoundary("end", -1)}
                    style={{ padding: "6px 7px", fontSize: 9 }}
                  >
                    ← Trim end
                  </TraderBlankButton>
                  <TraderBlankButton
                    disabled={candidateEndIndex < 0 || candidateEndIndex >= chartData.length - 1}
                    onClick={() => adjustCandidateBoundary("end", 1)}
                    style={{ padding: "6px 7px", fontSize: 9 }}
                  >
                    Extend end →
                  </TraderBlankButton>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", border: `1px solid ${theme.dark.borderSoft}` }}>
                {(["structure", "length", "size"] as const).map((key) => {
                  const val  = validation.candidate!.result.scores[key];
                  const gate = key === "structure" ? 85 : 70;
                  return (
                    <div key={key} style={{
                      minWidth: 0, padding: "9px 8px",
                      borderRight: key !== "size" ? `1px solid ${theme.dark.borderSoft}` : undefined,
                    }}>
                      <div style={{ color: theme.dark.muted2, fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {key}
                      </div>
                      <div style={{
                        color: val < gate ? theme.dark.errorText : key === "structure" ? theme.dark.accent : theme.dark.text,
                        fontSize: 15, marginTop: 4,
                      }}>
                        {val.toFixed(0)}%
                      </div>
                      <div style={{ color: theme.dark.hint, fontSize: 8, marginTop: 2 }}>
                        min {gate}%
                      </div>
                    </div>
                  );
                })}
                </div>

                {validation.candidate.semantic ? <div style={{ border: `1px solid ${theme.dark.borderSoft}`, padding: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                    <span style={{ color: theme.dark.muted2 }}>Structural semantics</span>
                    <span style={{ color: validation.candidate.semantic.qualified ? theme.dark.successText : theme.dark.errorText }}>{validation.candidate.semantic.score.toFixed(0)}%</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 7 }}>
                    {validation.candidate.semantic.results.map((result) => {
                      const weak = result.score < 70;
                      const color = weak && result.importance === "required" ? theme.dark.errorText : weak ? "#f1b86b" : theme.dark.successText;
                      return <div key={result.id} style={{ display: "flex", gap: 6, fontSize: 8, padding: "3px 4px", border: `1px solid ${theme.dark.borderSoft}` }}>
                        <span style={{ color: theme.dark.text, flex: 1 }}>{result.label}</span><span style={{ color }}>{result.score.toFixed(0)}%</span>
                      </div>;
                    })}
                    {validation.candidate.semantic.execution.map((result) => <div key={result.id} style={{ display: "flex", gap: 6, fontSize: 8, padding: "3px 4px", border: `1px solid ${theme.dark.borderSoft}` }}>
                      <span style={{ color: theme.dark.text, flex: 1 }}>{result.label}</span><span style={{ color: theme.dark.muted2 }}>{result.role.replace(/_/g, " ")}</span><span style={{ color: theme.dark.successText }}>mapped</span>
                    </div>)}
                    {!validation.candidate.semantic.qualified && <div style={{ color: theme.dark.errorText, fontSize: 8 }}>Execution marks withheld until structural semantics pass.</div>}
                  </div>
                </div> : <div style={{ color: theme.dark.hint, fontSize: 8 }}>No semantic concepts saved; this match uses candle structure only.</div>}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <TraderBlankButton
                    active
                    onClick={() => void acceptCandidate()}
                    style={{ padding: "7px 8px", fontSize: 10 }}
                  >
                    Save match
                  </TraderBlankButton>
                  <TraderBlankButton
                    onClick={rejectCandidate}
                    style={{ padding: "7px 8px", fontSize: 10 }}
                  >
                    Skip match
                  </TraderBlankButton>
                </div>
              </div>
            ) : validation.done ? (
              <div style={{ color: theme.dark.muted2, fontSize: 10, padding: "5px 0" }}>No more matches in available history.</div>
            ) : (
              <div style={{ color: theme.dark.muted, fontSize: 10, display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: theme.dark.accent, display: "inline-block", boxShadow: `0 0 0 3px ${theme.dark.accentSoft}` }} />
                {validation.historyRequest ? "Loading previous history…" : "Scanning candles…"}
              </div>
            )}

            <TraderBlankButton
              onClick={stopValidation}
              style={{
                width: "100%", marginTop: 10, padding: "6px 8px",
                color: theme.dark.muted, fontSize: 9,
              }}
            >
              End validation
            </TraderBlankButton>
          </div>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {strategy.snapshots.map((snapshot, index) => (
          <article
            key={`${snapshot.annotated_at}-${index}`}
            style={{
              position: "relative",
              minWidth: 0,
              border: `1px solid ${validation.active && validation.strategyId === strategy.id && validation.candidate
                && index === (validation.aggregate ? validation.candidate.referenceIndex : strategy.snapshots.length - 1)
                ? theme.dark.accent : theme.dark.borderSoft}`,
              background: strategyCardBackground,
            }}
          >
            <div style={cornerStyle()} />
            <div style={{ height: 96, borderBottom: `1px solid ${theme.dark.borderSoft}`, position: "relative" }}>
              <CandleStickChart
                data={snapshot.candles}
                minimal
                theme={chartTheme}
                semanticMarks={(strategyTeaching?.strategyId === strategy.id && strategyTeaching.snapshotIndex === index
                  ? strategyTeaching.annotations : snapshot.annotations).map((annotation) => ({ annotation }))}
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
                {snapshot.annotations.length} semantic {snapshot.annotations.length === 1 ? "mark" : "marks"}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
