import {
  buildAnnotationPayload,
  saveUserAnnotation,
  updateUserStrategySnapshotAnnotations,
} from "@/app/components/handlers/annotations";
import type { AnnotationDraft, ValidationState } from "./types";
import { buildValidationMarks } from "./validationMarks";

type ActiveValidation = Extract<
  ValidationState,
  { active: true }
>;

export async function saveValidationCandidate(
  validation: ActiveValidation,
  shortname: string,
) {
  const candidate = validation.candidate;

  if (!candidate) return;

  const draft: AnnotationDraft = {
    label: validation.strategyLabel,
    timeStart: candidate.candles[0].time,
    timeEnd:
      candidate.candles[candidate.candles.length - 1].time,
    candles: candidate.candles,
  };
  const payload = buildAnnotationPayload(draft, shortname);
  const saved = await saveUserAnnotation(payload);

  if (!candidate.semantic) return;

  const projected = {
    ...candidate,
    candles: candidate.candles.map((candle, index) => ({
      ...candle,
      ...payload.candles[index],
    })),
  };
  const annotations = buildValidationMarks(
    projected,
    validation.semanticReferences,
  ).map(({ annotation }) => annotation);

  if (!annotations.length) return;

  await updateUserStrategySnapshotAnnotations(
    saved.id,
    saved.snapshot_count - 1,
    annotations,
  );
}
