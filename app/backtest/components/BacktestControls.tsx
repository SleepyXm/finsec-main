import { useEffect, useRef } from "react";
import { BacktestSession } from "@/app/types/backend";

interface Props {
  session: BacktestSession;
  cursor: number;
  setCursor: React.Dispatch<React.SetStateAction<number>>;  // ← this instead of (n: number) => void
  totalCandles: number;
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
}

const SPEEDS = [
  { label: "0.5x", ms: 1000 },
  { label: "1x",   ms: 500  },
  { label: "2x",   ms: 250  },
  { label: "5x",   ms: 100  },
  { label: "10x",  ms: 50   },
];

export default function BacktestControls({
  session, cursor, setCursor, totalCandles, playing, setPlaying,
}: Props) {
  const speedRef  = useRef(500);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setCursor((prev: number) => {
          if (prev >= totalCandles) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, speedRef.current);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing]);

  function setSpeed(ms: number) {
    speedRef.current = ms;
    if (playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setCursor((prev: number) => {
          if (prev >= totalCandles) { setPlaying(false); return prev; }
          return prev + 1;
        });
      }, ms);
    }
  }

  const progress = totalCandles > 0 ? (cursor / totalCandles) * 100 : 0;

  return (
    <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying(!playing)}
          className="px-4 py-1.5 rounded bg-blue-600 text-sm font-medium text-white hover:bg-blue-700"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => { setPlaying(false); setCursor(0); }}
          className="px-4 py-1.5 rounded bg-zinc-700 text-sm text-zinc-300 hover:bg-zinc-600"
        >
          Reset
        </button>
        <button
          onClick={() => setCursor(Math.min(cursor + 1, totalCandles))}
          disabled={playing}
          className="px-4 py-1.5 rounded bg-zinc-700 text-sm text-zinc-300 hover:bg-zinc-600 disabled:opacity-40"
        >
          Step →
        </button>

        <div className="flex gap-1 ml-auto">
          {SPEEDS.map((s) => (
            <button
              key={s.label}
              onClick={() => setSpeed(s.ms)}
              className={`px-2 py-1 rounded text-xs ${speedRef.current === s.ms ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-400"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full bg-zinc-700 rounded-full h-1.5">
        <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>

      <p className="text-xs text-zinc-500">
        Candle {cursor} / {totalCandles} — {session.ticker} {session.interval}
      </p>
    </div>
  );
}