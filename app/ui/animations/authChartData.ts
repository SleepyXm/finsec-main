import { UTCTimestamp } from "lightweight-charts";
import { Candle } from "@/app/types/charts";

type TapeStep = {
  closeDelta: number;
  highExtra: number;
  lowExtra: number;
  ticks: number[];
};

type SnapshotSignal = {
  mode: "entry" | "exit";
  direction: "long" | "short";
  entry: { x: number; y: number };
  exit: { x: number; y: number };
};

export function createLoopTape(length: number, seed: number): TapeStep[] {
  const random = createSeededRandom(seed);
  const bias = randomBetween(random, -0.08, 0.08);

  return Array.from({ length }, (_, index) => {
    const wave = Math.sin((index / length) * Math.PI * 2) * 0.85;
    const impulse = randomBetween(random, -1.55, 1.65);
    const closeDelta = wave + impulse + bias;

    const range = randomBetween(random, 1.25, 3.7);

    const highExtra = Math.max(
      0.5,
      Math.max(closeDelta, 0) + range * randomBetween(random, 0.45, 0.95),
    );

    const lowExtra = Math.max(
      0.5,
      Math.max(-closeDelta, 0) + range * randomBetween(random, 0.35, 0.85),
    );

    return {
      closeDelta,
      highExtra,
      lowExtra,
      ticks: createTicks(closeDelta, highExtra, lowExtra, 9, random),
    };
  });
}

function createTicks(
  closeDelta: number,
  highExtra: number,
  lowExtra: number,
  count: number,
  random: () => number,
) {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return 0;
    if (index === count - 1) return closeDelta;

    const progress = index / (count - 1);
    const wave =
      Math.sin(progress * Math.PI * 2) * randomBetween(random, 0.15, 0.65);
    const noise = randomBetween(random, -0.28, 0.28);
    const path = closeDelta * progress + wave + noise;

    return clamp(path, -lowExtra, highExtra);
  });
}

export function materializeCandle(
  template: TapeStep,
  open: number,
  time: UTCTimestamp,
): Candle {
  const close = open + template.closeDelta;
  const high = open + template.highExtra;
  const low = open - template.lowExtra;

  return {
    time,
    open,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    close,
    volume: null,
    buy_price: null,
  };
}

export function makeActiveCandle(
  template: TapeStep,
  open: number,
  time: UTCTimestamp,
): Candle {
  return {
    time,
    open,
    high: open,
    low: open,
    close: open + template.ticks[0],
    volume: null,
    buy_price: null,
  };
}

export function createSnapshotSignal(): SnapshotSignal {
  const mode: "entry" | "exit" = Math.random() > 0.5 ? "entry" : "exit";
  const direction: "long" | "short" = Math.random() > 0.35 ? "long" : "short";

  const entryX = randomBetween(Math.random, 16, 34);
  const exitX = randomBetween(Math.random, 66, 86);

  if (direction === "long") {
    return {
      mode,
      direction,
      entry: {
        x: entryX,
        y: randomBetween(Math.random, 62, 76),
      },
      exit: {
        x: exitX,
        y: randomBetween(Math.random, 24, 42),
      },
    };
  }

  return {
    mode,
    direction,
    entry: {
      x: entryX,
      y: randomBetween(Math.random, 24, 42),
    },
    exit: {
      x: exitX,
      y: randomBetween(Math.random, 62, 76),
    },
  };
}

export function normalizeTime(seconds: number): UTCTimestamp {
  return (Math.floor(seconds / 60) * 60) as UTCTimestamp;
}

function createSeededRandom(seed: number) {
  let value = seed >>> 0;

  return function random() {
    value += 0x6d2b79f5;

    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);

    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(random: () => number, min: number, max: number) {
  return min + random() * (max - min);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
