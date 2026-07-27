"use client";

import { cx } from "@/app/UI/classnames";
import { ToolPanel } from "@/app/UI/components/ToolPanel";
import { TraderBlankButton } from "@/app/UI/components/LegacyPrimitives";
import type { ValidationCandidate } from "@/app/(pages)/chart/SimilaritySearch/validation";
import styles from "./StrategyValidationPanel.module.css";
import { NumberStepper } from "@/app/UI/client";

type Boundary = "start" | "end";

export function StrategyValidationPanel({
  active,
  status,
  summary,
  scanned,
  available,
  candidate,
  done,
  loadingHistory,
  canStart,
  canTrim,
  canExtendStart,
  canExtendEnd,
  formationPercent,
  onFormationPercentChange,
  onStart,
  onStop,
  onResize,
  onAccept,
  onReject,
}: {
  active: boolean;
  status: string;
  summary: string;
  scanned: number;
  available: number;
  candidate: ValidationCandidate | null;
  done: boolean;
  loadingHistory: boolean;
  canStart: boolean;
  canTrim: boolean;
  canExtendStart: boolean;
  canExtendEnd: boolean;
  formationPercent: number;
  onFormationPercentChange: (value: number) => void;
  onStart: () => void;
  onStop: () => void;
  onResize: (boundary: Boundary, delta: -1 | 1) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <ToolPanel
      title="Validation scan"
      status={status}
      statusTone={candidate ? "success" : active ? "accent" : "muted"}
      active={active}
      className={styles.panel}
    >
      <div className={cx(styles.summary, active && styles.activeSummary)}>{summary}</div>
      {!active ? (
        <>
          <label className={styles.threshold}>
            <span>Recognise a forming structure after</span>
            <span className={styles.thresholdControl}>
              <NumberStepper
                min={1}
                max={100}
                value={formationPercent}
                onChange={onFormationPercentChange}
                step={1}
                integer
                ariaLabel="Formation recognition percentage"
                style={{ width: 70, height: 26 }}
              />
              <span className={styles.thresholdSuffix}>%</span>
            </span>
          </label>
          <TraderBlankButton active disabled={!canStart} onClick={onStart} className={styles.primaryAction}>
            Validate Strategy
          </TraderBlankButton>
        </>
      ) : (
        <>
          <div className={styles.progress}>
            <span>History scanned</span>
            <span className={styles.progressValue}>{Math.min(scanned, available)} / {available}</span>
          </div>
          {candidate ? (
            <div className={styles.candidate}>
              <div className={styles.caption}>
                {candidate.result.state === "complete" ? "Complete" : "Forming"} range · {candidate.candles.length} candles · {candidate.result.supportCount}/{candidate.result.referenceCount} snapshots
              </div>
              <div className={styles.actions}>
                <TraderBlankButton disabled={!canExtendStart} onClick={() => onResize("start", -1)} className={styles.smallAction}>← Extend start</TraderBlankButton>
                <TraderBlankButton disabled={!canTrim} onClick={() => onResize("start", 1)} className={styles.smallAction}>Trim start →</TraderBlankButton>
                <TraderBlankButton disabled={!canTrim} onClick={() => onResize("end", -1)} className={styles.smallAction}>← Trim end</TraderBlankButton>
                <TraderBlankButton disabled={!canExtendEnd} onClick={() => onResize("end", 1)} className={styles.smallAction}>Extend end →</TraderBlankButton>
              </div>
              <ScoreDiagnostics candidate={candidate} formationPercent={formationPercent} />
              <SemanticDiagnostics candidate={candidate} />
              <div className={styles.actions}>
                <TraderBlankButton active onClick={onAccept} className={styles.resultAction}>Save match</TraderBlankButton>
                <TraderBlankButton onClick={onReject} className={styles.resultAction}>Skip match</TraderBlankButton>
              </div>
            </div>
          ) : done ? (
            <div className={styles.empty}>No more matches in available history.</div>
          ) : (
            <div className={styles.working}>
              <span className={styles.pulse} />
              {loadingHistory ? "Loading previous history…" : "Scanning candles…"}
            </div>
          )}
          <TraderBlankButton onClick={onStop} className={styles.stopAction}>End validation</TraderBlankButton>
        </>
      )}
    </ToolPanel>
  );
}

function ScoreDiagnostics({
  candidate,
  formationPercent,
}: {
  candidate: ValidationCandidate;
  formationPercent: number;
}) {
  const consensusGate = candidate.result.requiredSupport /
    candidate.result.referenceCount * 100;
  const metrics = [
    ["structure", candidate.result.scores.structure, 85],
    ["magnitude", candidate.result.scores.magnitude, 70],
    ["coverage", candidate.result.scores.coverage, formationPercent],
    ["consensus", candidate.result.scores.consensus, consensusGate],
  ] as const;
  return (
    <div className={styles.scores}>
      {metrics.map(([key, value, gate]) => (
        <div key={key} className={styles.score}>
          <div className={styles.scoreLabel}>{key}</div>
          <div className={cx(styles.scoreValue, value < gate ? styles.scoreFail : key === "structure" && styles.scorePrimary)}>{value.toFixed(0)}%</div>
          <div className={styles.scoreGate}>min {gate.toFixed(0)}%</div>
        </div>
      ))}
    </div>
  );
}

function SemanticDiagnostics({ candidate }: { candidate: ValidationCandidate }) {
  if (!candidate.semantic) {
    return <div className={styles.hint}>No semantic concepts saved; this match uses candle structure only.</div>;
  }

  return (
    <div className={styles.semantics}>
      <div className={styles.semanticHeader}>
        <span className={styles.muted}>Structural semantics</span>
        <span className={candidate.semantic.qualified ? styles.success : styles.danger}>{candidate.semantic.score.toFixed(0)}%</span>
      </div>
      <div className={styles.semanticList}>
        {candidate.semantic.results.map((result) => {
          const weak = result.score < 70;
          return (
            <div key={result.id} className={styles.semanticRow}>
              <span className={styles.semanticLabel}>{result.label}{result.forming ? " · forming" : ""}</span>
              <span className={weak ? result.importance === "required" ? styles.danger : styles.warning : styles.success}>{result.score.toFixed(0)}%</span>
            </div>
          );
        })}
        {candidate.semantic.execution.map((result) => (
          <div key={result.id} className={styles.semanticRow}>
            <span className={styles.semanticLabel}>{result.label}</span>
            <span className={styles.muted}>{result.role.replace(/_/g, " ")}</span>
            <span className={styles.success}>mapped</span>
          </div>
        ))}
      </div>
    </div>
  );
}
