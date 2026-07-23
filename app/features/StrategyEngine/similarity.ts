/**
 * app/chart/similarity.ts
 *
 * Pure similarity scoring. No UI, no persistence.
 * Structure ≥ 85 is a hard gate. Every supporting score ≥ 70 is a hard gate.
 * Strong length/size cannot compensate for weak structure.
 */
 
import type { Candle } from "@/app/components/types/charts";
import type {
  SimilarityResult,
  SimilarityScores,
} from "./types";

export type {
  SimilarityResult,
  SimilarityScores,
} from "./types";
 
const STRUCTURE_GATE = 85;
const SUPPORT_GATE   = 70;
 
// ---------------------------------------------------------------------------
// Normalise a raw candle window the same way buildAnnotationPayload does:
// each OHLC value becomes % movement from the first candle's open.
// ---------------------------------------------------------------------------
export function normaliseCandles(
  candles: Candle[],
): Array<{ open: number; high: number; low: number; close: number }> {
  if (!candles.length) return [];
  const anchor = candles[0].open;
  if (anchor === 0) return [];
  return candles.map((c) => ({
    open:  ((c.open  - anchor) / anchor) * 100,
    high:  ((c.high  - anchor) / anchor) * 100,
    low:   ((c.low   - anchor) / anchor) * 100,
    close: ((c.close - anchor) / anchor) * 100,
  }));
}

type CandleValues = Pick<Candle, "open" | "high" | "low" | "close">;

function scale(candles: CandleValues[]) {
  const low = Math.min(...candles.map((candle) => candle.low));
  const high = Math.max(...candles.map((candle) => candle.high));
  const span = Math.max(Number.EPSILON, high - low);
  return candles.map((candle) => [candle.open, candle.high, candle.low, candle.close]
    .map((value) => (value - low) / span));
}

/** Monotonic source-candle to candidate-candle correspondence. */
export function alignCandleStructure(reference: CandleValues[], observed: Candle[]) {
  if (!reference.length || !observed.length) return [];
  const source = scale(reference);
  const target = scale(normaliseCandles(observed));
  const costs = source.map(() => target.map(() => Number.POSITIVE_INFINITY));
  const distance = (left: number[], right: number[]) =>
    left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / left.length;

  source.forEach((candle, sourceIndex) => target.forEach((candidate, targetIndex) => {
    const previous = sourceIndex === 0 && targetIndex === 0 ? 0 : Math.min(
      sourceIndex && targetIndex ? costs[sourceIndex - 1][targetIndex - 1] : Number.POSITIVE_INFINITY,
      sourceIndex ? costs[sourceIndex - 1][targetIndex] : Number.POSITIVE_INFINITY,
      targetIndex ? costs[sourceIndex][targetIndex - 1] : Number.POSITIVE_INFINITY,
    );
    costs[sourceIndex][targetIndex] = distance(candle, candidate) + previous;
  }));

  const matches = source.map(() => [] as number[]);
  let sourceIndex = source.length - 1;
  let targetIndex = target.length - 1;
  while (true) {
    matches[sourceIndex].push(targetIndex);
    if (sourceIndex === 0 && targetIndex === 0) break;
    const steps = [
      sourceIndex && targetIndex ? [sourceIndex - 1, targetIndex - 1] : null,
      sourceIndex ? [sourceIndex - 1, targetIndex] : null,
      targetIndex ? [sourceIndex, targetIndex - 1] : null,
    ].filter((step): step is number[] => step !== null);
    [sourceIndex, targetIndex] = steps.reduce((best, step) =>
      costs[step[0]][step[1]] < costs[best[0]][best[1]] ? step : best);
  }
  return matches.map((indices, index) => indices.length
    ? Math.round(indices.reduce((sum, value) => sum + value, 0) / indices.length)
    : Math.round(index * (target.length - 1) / Math.max(1, source.length - 1)));
}
 
// ---------------------------------------------------------------------------
// Resample an array to a target length using linear interpolation.
// This preserves shape while allowing length-independent comparison.
// ---------------------------------------------------------------------------
function resample(
  values: number[],
  targetLen: number,
): number[] {
  if (values.length === targetLen) return values;
  if (values.length === 1) return Array(targetLen).fill(values[0]);
  const out: number[] = [];
  for (let i = 0; i < targetLen; i++) {
    const t   = i / (targetLen - 1);
    const raw = t * (values.length - 1);
    const lo  = Math.floor(raw);
    const hi  = Math.min(lo + 1, values.length - 1);
    const frac = raw - lo;
    out.push(values[lo] * (1 - frac) + values[hi] * frac);
  }
  return out;
}
 
// ---------------------------------------------------------------------------
// Structure score: compare two normalised windows as shapes.
// We use all four OHLC channels resampled to a common length, then
// compute a correlation-style score on the combined signal.
// ---------------------------------------------------------------------------
function structureScore(
  ref: ReturnType<typeof normaliseCandles>,
  obs: ReturnType<typeof normaliseCandles>,
): number {
  // Flatten each window into a single signal: [open0,high0,low0,close0, open1,…]
  const flatten = (w: typeof ref) =>
    w.flatMap((c) => [c.open, c.high, c.low, c.close]);
 
  const refSig = flatten(ref);
  const obsSig = flatten(obs);
 
  // Resample the shorter to match the longer
  const len = Math.max(refSig.length, obsSig.length);
  const r = resample(refSig, len);
  const o = resample(obsSig, len);
 
  // Pearson correlation expressed directly as 0–100 similarity.
  // Negative correlation is not structural similarity.
  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const mr = mean(r);
  const mo = mean(o);
  let num = 0, dr = 0, do_ = 0;
  for (let i = 0; i < len; i++) {
    const rr = r[i] - mr;
    const oo = o[i] - mo;
    num += rr * oo;
    dr  += rr * rr;
    do_ += oo * oo;
  }
  const denom = Math.sqrt(dr * do_);
  if (denom === 0) return 0;
  const corr = num / denom; // –1 … 1
  return Math.max(0, Math.min(100, corr * 100));
}
 
// ---------------------------------------------------------------------------
// Length score: how similar are the window lengths?
// Score = 100 when equal, falls toward 0 as the ratio diverges.
// ---------------------------------------------------------------------------
function lengthScore(refLen: number, obsLen: number): number {
  if (refLen === 0 || obsLen === 0) return 0;
  const ratio = Math.min(refLen, obsLen) / Math.max(refLen, obsLen);
  return ratio * 100;
}
 
// ---------------------------------------------------------------------------
// Size score: how similar is the total price range (high–low span) of each
// normalised window?
// ---------------------------------------------------------------------------
function sizeScore(
  ref: ReturnType<typeof normaliseCandles>,
  obs: ReturnType<typeof normaliseCandles>,
): number {
  const span = (w: typeof ref) => {
    const highs = w.map((c) => c.high);
    const lows  = w.map((c) => c.low);
    return Math.max(...highs) - Math.min(...lows);
  };
  const rs = span(ref);
  const os = span(obs);
  if (rs === 0 && os === 0) return 100;
  if (rs === 0 || os === 0) return 0;
  const ratio = Math.min(rs, os) / Math.max(rs, os);
  return ratio * 100;
}
 
// ---------------------------------------------------------------------------
// Public API: compare an observed candle window against a reference snapshot.
// The reference snapshot's candles should already be normalised (% from anchor)
// as stored by buildAnnotationPayload / the backend.
// The observed candles are raw and will be normalised here.
// ---------------------------------------------------------------------------
export function compareWindow(
  refNormalised: Array<{ open: number; high: number; low: number; close: number }>,
  observed: Candle[],
): SimilarityResult {
  const obsNormalised = normaliseCandles(observed);
 
  const scores: SimilarityScores = {
    structure: structureScore(refNormalised, obsNormalised),
    length:    lengthScore(refNormalised.length, observed.length),
    size:      sizeScore(refNormalised, obsNormalised),
  };
 
  if (scores.structure < STRUCTURE_GATE) {
    return { qualified: false, scores, reason: `Structure ${scores.structure.toFixed(0)}% < ${STRUCTURE_GATE}%` };
  }
  if (scores.length < SUPPORT_GATE) {
    return { qualified: false, scores, reason: `Length ${scores.length.toFixed(0)}% < ${SUPPORT_GATE}%` };
  }
  if (scores.size < SUPPORT_GATE) {
    return { qualified: false, scores, reason: `Size ${scores.size.toFixed(0)}% < ${SUPPORT_GATE}%` };
  }
 
  return { qualified: true, scores };
}
 
