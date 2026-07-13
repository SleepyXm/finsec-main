"use client";

import { useCallback, useEffect, useState } from "react";
import type { BacktestResponse, BacktestSummary } from "@/app/types/backend";
import {
  deleteBacktestSession,
  getBacktestSession,
  listBacktests,
} from "../services/backtest";
import {
  MonoLabel,
  TraderBlankButton,
  cornerStyle,
  panelStyle,
  theme,
} from "@/app/ui";

interface Props {
  onResume: (backtest: BacktestResponse) => void;
}

const compactButton = { padding: "5px 8px", fontSize: 9 };

export default function SavedBacktests({ onResume }: Props) {
  const [items, setItems] = useState<BacktestSummary[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listBacktests()
      .then(setItems)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Failed to load backtests"));
  }, []);

  useEffect(() => refresh(), [refresh]);

  async function resume(sessionId: string) {
    setBusyId(sessionId);
    setError(null);
    try {
      onResume(await getBacktestSession(sessionId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to resume backtest");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(sessionId: string) {
    setBusyId(sessionId);
    setError(null);
    try {
      await deleteBacktestSession(sessionId);
      setItems((current) => current.filter((item) => item.session_id !== sessionId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete backtest");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0 && !error) return null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <MonoLabel>Recent backtests</MonoLabel>
      {error && (
        <div style={{ background: theme.dark.errorBg, color: theme.dark.errorText, padding: 9, fontSize: 10 }}>
          {error}
        </div>
      )}
      {items.map((item) => {
        const busy = busyId === item.session_id;
        return (
          <article key={item.session_id} style={{ ...panelStyle(theme.dark), padding: 10 }}>
            <div style={cornerStyle()} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: theme.dark.text, fontSize: 12 }}>
                  {item.ticker} <span style={{ color: theme.dark.muted2 }}>· {item.interval}</span>
                </div>
                <div style={{ color: theme.dark.muted2, fontSize: 9, marginTop: 4, lineHeight: 1.5 }}>
                  Candle {item.current_candle.toLocaleString()} · ${item.starting_balance.toLocaleString()}
                  <br />Expires {new Date(item.expires_at).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
                <TraderBlankButton
                  style={{ ...compactButton, opacity: busy ? 0.45 : 1 }}
                  disabled={busy}
                  onClick={() => resume(item.session_id)}
                >
                  Resume
                </TraderBlankButton>
                <TraderBlankButton
                  style={{ ...compactButton, color: theme.dark.errorText, opacity: busy ? 0.45 : 1 }}
                  disabled={busy}
                  onClick={() => remove(item.session_id)}
                >
                  Delete
                </TraderBlankButton>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
