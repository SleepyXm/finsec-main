import type { Candle } from "@/app/components/types/charts";

export type AnnotationDraft = {
  label: string;
  timeStart: number;
  timeEnd: number;
  candles: Candle[];
};

export type AnnotationCandle = Pick<
  Candle,
  "open" | "high" | "low" | "close"
>;

type AnnotationBase = {
  id: string;
  conceptId: string;
  label: string;
  role: "structure" | "entry" | "exit" | "stop_loss" | "take_profit";
  importance: "required" | "preferred" | "informational";
  trigger:
    | "presence"
    | "touch"
    | "cross"
    | "close_above"
    | "close_below"
    | "rejection";
};

type RangedAnnotation = {
  startIndex: number;
  endIndex: number;
};

export type StrategyAnnotation =
  | (AnnotationBase & RangedAnnotation & { kind: "candle_group" })
  | (AnnotationBase &
      RangedAnnotation & {
        kind: "zone";
        priceHigh: number;
        priceLow: number;
      })
  | (AnnotationBase &
      RangedAnnotation & {
        kind: "level";
        price: number;
      })
  | (AnnotationBase & {
      kind: "marker";
      candleIndex: number;
      priceAnchor: "open" | "high" | "low" | "close";
      price: number;
    });

export type StrategySnapshot = {
  symbol: string;
  annotated_at: string;
  candles: Candle[];
  annotations: StrategyAnnotation[];
};

export type SavedStrategy = {
  id: string;
  title: string;
  snapshot_count: number;
  created_at: string;
  updated_at: string;
  preview: StrategySnapshot;
};

export type StrategyDetails = Omit<SavedStrategy, "preview"> & {
  snapshots: StrategySnapshot[];
};

export type SimilarityScores = {
  structure: number;
  length: number;
  size: number;
};

export type SimilarityResult =
  | { qualified: true; scores: SimilarityScores }
  | {
      qualified: false;
      scores: SimilarityScores;
      reason: string;
    };

export type SemanticPlacement = {
  id: string;
  conceptId: string;
  label: string;
  role: StrategyAnnotation["role"];
  matchedStartIndex: number;
  matchedEndIndex: number;
  referenceIndex: number;
  priceAnchor?: "open" | "high" | "low" | "close";
};

export type SemanticResult = SemanticPlacement & {
  importance: StrategyAnnotation["importance"];
  score: number;
  passed: boolean;
};

export type SemanticValidation = {
  qualified: boolean;
  score: number;
  results: SemanticResult[];
  execution: SemanticPlacement[];
};

export type ValidationCandidate = {
  candles: Candle[];
  result: SimilarityResult;
  semantic: SemanticValidation | null;
  referenceIndex: number;
};

export type StrategyReference = Pick<
  StrategySnapshot,
  "candles" | "annotations"
>;

export type ValidationState =
  | { active: false }
  | {
      active: true;
      strategyId: string;
      strategyLabel: string;
      references: StrategyReference[];
      semanticReferences: StrategySnapshot[];
      aggregate: boolean;
      minLength: number;
      maxLength: number;
      scanIndex: number;
      scanned: number;
      available: number;
      historyRequest: {
        oldestTime: number;
        settled: boolean;
      } | null;
      candidate: ValidationCandidate | null;
      done: boolean;
    };

export type CandidateBoundaryAdjustment =
  | {
      target: "candidate";
      boundary: "start" | "end";
      delta: -1 | 1;
    }
  | {
      target: "semantic";
      annotationId: string;
      boundary: "start" | "end";
      candleIndex: number;
    }
  | {
      target: "marker";
      annotationId: string;
      candleIndex: number;
      priceAnchor: "open" | "high" | "low" | "close";
    };

export type StrategyTeachingTool =
  | "candle_group"
  | "zone"
  | "level"
  | "entry"
  | "exit"
  | "stop_loss"
  | "take_profit";

export type StrategyTeachingState = {
  strategyId: string;
  snapshotIndex: number;
  snapshot: StrategySnapshot;
  annotations: StrategyAnnotation[];
  tool: StrategyTeachingTool;
  label: string;
  importance: StrategyAnnotation["importance"];
  trigger: StrategyAnnotation["trigger"];
};

export type SemanticMark = {
  annotation: StrategyAnnotation;
  score?: number;
  status?: "pass" | "weak" | "fail";
};

export type StrategyChartController = {
  isCreatingStrategy: boolean;
  annotationStrategyLabel: string | null;
  handleAnnotation: (
    annotation: AnnotationDraft,
  ) => void | Promise<void>;
  validation: ValidationState;
  strategyTeaching: StrategyTeachingState | null;
  adjustCandidateBoundary: (
    adjustment: CandidateBoundaryAdjustment,
  ) => void;
  setStrategyTeachingAnnotations: (
    annotations: StrategyAnnotation[],
  ) => void;
};
