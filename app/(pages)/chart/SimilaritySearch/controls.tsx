import { useState } from "react";
import { StrategyDetails } from "@/app/components/handlers/annotations";
import { useChartContext } from "@/app/(pages)/chart/chartcontext";
import { StrategyValidationPanel } from "@/app/UI";

export function StrategyValidationControls({ strategy }: { strategy: StrategyDetails }) {
  const [formationPercent, setFormationPercent] = useState(50);
  const {
    validation,
    startValidation,
    stopValidation,
    acceptCandidate,
    rejectCandidate,
    adjustCandidateBoundary,
    chartData,
  } = useChartContext();
  const active = validation.active && validation.strategyId === strategy.id;
  const reference = strategy.snapshots[strategy.snapshots.length - 1];
  const candidate = active ? validation.candidate : null;
  const startIndex = candidate
    ? chartData.findIndex(({ time }) => time === candidate.candles[0].time)
    : -1;
  const endIndex = candidate
    ? chartData.findIndex(({ time }) => time === candidate.candles[candidate.candles.length - 1].time)
    : -1;
  const lengths = strategy.snapshots.map(({ candles }) => candles.length);
  const summary = active
    ? `${validation.snapshots.length}-snapshot reference set · ${validation.formationPercent}% formation · ${validation.minFormationLength}–${validation.maxFormationLength} candles`
    : strategy.snapshots.length > 1
      ? `${strategy.snapshots.length}-snapshot reference set · ${Math.min(...lengths)}–${Math.max(...lengths)} candles`
      : `Single snapshot · ${reference?.candles.length ?? 0} candles`;

  return (
    <StrategyValidationPanel
      active={active}
      status={!active ? "Ready" : candidate ? candidate.result.state === "complete" ? "Complete match" : "Formation found" : validation.done ? "Complete" : validation.historyRequest ? "Loading history" : "Scanning"}
      summary={summary}
      scanned={active ? validation.scanned : 0}
      available={active ? validation.available : 0}
      candidate={candidate}
      done={active && validation.done}
      loadingHistory={active && Boolean(validation.historyRequest)}
      canStart={Boolean(reference)}
      canTrim={Boolean(candidate && active && candidate.candles.length > validation.minFormationLength)}
      canExtendStart={startIndex > 0}
      canExtendEnd={endIndex >= 0 && endIndex < chartData.length - 1}
      formationPercent={active ? validation.formationPercent : formationPercent}
      onFormationPercentChange={(value) => setFormationPercent(Math.max(1, Math.min(100, value || 1)))}
      onStart={() => reference && startValidation(
        strategy.id,
        strategy.title,
        strategy.snapshots,
        formationPercent,
      )}
      onStop={stopValidation}
      onResize={(boundary, delta) => adjustCandidateBoundary({ target: "candidate", boundary, delta })}
      onAccept={() => void acceptCandidate()}
      onReject={rejectCandidate}
    />
  );
}
