"use client";

import { useEffect, useState } from "react";
import React from "react";
import { BacktestSession } from "@/app/components/types/backend";
import type {
  ForwardPassState,
  StrategyDetails,
} from "@/app/features/StrategyEngine/types";
import { MonoLabel, TraderBlankButton, Button, cornerStyle, panelStyle, theme } from "@/app/UI";

interface Props {
  session: BacktestSession;
  cursor: number;
  setCursor: (cursor: number) => void;
  totalCandles: number;
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  onReset: () => void;
  strategy: StrategyDetails | null;
  forwardPass: ForwardPassState | null;
}

const SPEEDS = [
  { label: "0.5x", ms: 1000 },
  { label: "1x", ms: 500 },
  { label: "2x", ms: 250 },
  { label: "5x", ms: 100 },
  { label: "10x", ms: 50 },
];

const compactButton = { padding: "6px 10px", fontSize: 10, minHeight: 28 };

export default function BacktestControls({
  session,
  cursor,
  setCursor,
  totalCandles,
  playing,
  setPlaying,
  onReset,
  strategy,
  forwardPass,
}: Props) {
  const [speed, setSpeed] = useState(500);

  useEffect(() => {
    if (!playing) return;
    if (cursor >= totalCandles) return;

    const timer = window.setTimeout(
      () => {
        const next = cursor + 1;
        setCursor(next);
        if (next >= totalCandles) {
          setPlaying(false);
        }
      },
      speed,
    );

    return () => window.clearTimeout(timer);
  }, [
    cursor,
    playing,
    setCursor,
    setPlaying,
    speed,
    totalCandles,
  ]);

  const progress = totalCandles ? (cursor / totalCandles) * 100 : 0;

  return (
    <section style={{ ...panelStyle(theme.dark), padding: 12 }}>
      <div style={cornerStyle()} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPlaying((current) => !current)}
          style={compactButton}
        >
          {playing ? "Pause" : "Play"}
        </Button>
        <TraderBlankButton style={compactButton} onClick={onReset}>
          Reset
        </TraderBlankButton>
        <TraderBlankButton
          style={compactButton}
          disabled={playing || cursor >= totalCandles}
          onClick={() =>
            setCursor(
              Math.min(cursor + 1, totalCandles),
            )
          }
        >
          Step
        </TraderBlankButton>

        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {SPEEDS.map((option) => (
            <TraderBlankButton
              key={option.label}
              active={speed === option.ms}
              style={{ padding: "5px 7px", fontSize: 10 }}
              onClick={() => setSpeed(option.ms)}
            >
              {option.label}
            </TraderBlankButton>
          ))}
        </div>
      </div>

      <div style={{ height: 2, background: theme.dark.bg3, margin: "12px 0 9px" }}>
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: theme.dark.accent,
            transition: "width 120ms linear",
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <MonoLabel>{session.ticker} · {session.interval}</MonoLabel>
        <span style={{ color: theme.dark.muted2, fontSize: 10, fontFamily: "var(--font-code), monospace" }}>
          Candle {cursor.toLocaleString()} / {totalCandles.toLocaleString()}
        </span>
      </div>

      {strategy && forwardPass && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 9,
            paddingTop: 9,
            borderTop: `1px solid ${theme.dark.borderSoft}`,
          }}
        >
          <MonoLabel>Strategy · {strategy.title}</MonoLabel>
          <span
            style={{
              color:
                forwardPass.status === "invalidated"
                  ? theme.dark.errorText
                  : forwardPass.status === "searching"
                    ? theme.dark.muted2
                    : theme.dark.accent,
              fontSize: 9,
              fontFamily: "var(--font-code), monospace",
              textAlign: "right",
            }}
          >
            {forwardPass.status.toUpperCase()}
            {forwardPass.formation && (
              <>
                {" · "}
                {forwardPass.formation.confidence.toFixed(0)}%
                {" · "}
                {forwardPass.formation.support}/
                {forwardPass.formation.totalReferences} references
              </>
            )}
          </span>
        </div>
      )}
    </section>
  );
}
