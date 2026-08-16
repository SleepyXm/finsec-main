export const FINSEC_SNAPSHOT_INPUT_PREFIX = 'Finsec snapshot ';
export const MAX_PINE_INPUT_CHARACTERS = 40_960;

export type ApplyStrategyMessage = {
  type: 'FINSEC_APPLY_STRATEGY';
  rows: string[];
};

export type ApplyStrategyResponse =
  | { ok: true; appliedRows: number }
  | { ok: false; message: string };
