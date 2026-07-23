"use client";

import { useMemo, useState } from "react";
import { StrategyAnnotation, StrategyDetails } from "@/app/components/handlers/annotations";
import { useStrategyEngine } from "@/app/features/StrategyEngine/StrategyEngineProvider";
import type { StrategyTeachingTool } from "@/app/features/StrategyEngine/types";
import { cornerStyle, MonoLabel, theme, traderInsetPanelStyle, TraderBlankButton } from "@/app/UI";

const TOOLS: Array<{ value: StrategyTeachingTool; label: string }> = [
  { value: "candle_group", label: "Candle group" }, { value: "zone", label: "Zone" },
  { value: "level", label: "Level" }, { value: "entry", label: "Entry" },
  { value: "exit", label: "Exit" }, { value: "stop_loss", label: "Stop loss" },
  { value: "take_profit", label: "Take profit" },
];

export function SnapshotTeachingSection({ strategy, onSave }: {
  strategy: StrategyDetails;
  onSave: (index: number, annotations: StrategyAnnotation[]) => Promise<void>;
}) {
  const { strategyTeaching, openStrategyTeaching, setStrategyTeaching, setStrategyTeachingAnnotations } = useStrategyEngine();
  const index = strategyTeaching?.strategyId === strategy.id ? strategyTeaching.snapshotIndex : 0;
  const snapshot = strategy.snapshots[index];
  const draft = strategyTeaching?.strategyId === strategy.id ? strategyTeaching.annotations : snapshot?.annotations ?? [];
  const saved = snapshot?.annotations ?? [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const [saving, setSaving] = useState(false);
  const labels = useMemo(() => Array.from(new Set(strategy.snapshots
    .flatMap((item) => item.annotations).map((item) => item.label))).sort(), [strategy.snapshots]);
  if (!snapshot) return null;
  const ordered = [...draft].sort((left, right) => {
    if (
      (left.kind !== "zone" && left.kind !== "level") ||
      (right.kind !== "zone" && right.kind !== "level")
    ) {
      return 0;
    }

    return (
      left.startIndex - right.startIndex ||
      left.endIndex - right.endIndex
    );
  });
  const move = (next: number) => {
    if (dirty && !window.confirm("Discard unsaved teaching changes?")) return;
    openStrategyTeaching(strategy.id, next, strategy.snapshots[next]);
  };
  const save = async () => {
    setSaving(true);
    try { await onSave(index, draft); } finally { setSaving(false); }
  };

  return <section style={{ ...traderInsetPanelStyle(theme.dark), margin: "10px 0" }}>
    <div style={cornerStyle()} />
    <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderBottom: `1px solid ${theme.dark.borderSoft}` }}>
      <div style={{ flex: 1 }}><MonoLabel>Teach strategy</MonoLabel><div style={{ color: theme.dark.muted2, fontSize: 8, marginTop: 3 }}>Snapshot {index + 1} of {strategy.snapshots.length} · main chart</div></div>
      <TraderBlankButton disabled={index === 0} onClick={() => move(index - 1)} style={{ padding: "4px 7px" }}>←</TraderBlankButton>
      <TraderBlankButton disabled={index === strategy.snapshots.length - 1} onClick={() => move(index + 1)} style={{ padding: "4px 7px" }}>→</TraderBlankButton>
    </header>
    <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ color: theme.dark.muted2, fontSize: 9 }}>Mark structure first; execution remains attached to its candle and OHLC anchor.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 5 }}>
        <input list="strategy-concepts" value={strategyTeaching?.label ?? ""} placeholder="Concept label" onChange={(event) => setStrategyTeaching({ label: event.target.value })} style={{ minWidth: 0, background: theme.dark.bg2, color: theme.dark.text, border: `1px solid ${theme.dark.borderSoft}`, padding: 6, fontSize: 9 }} />
        <datalist id="strategy-concepts">{labels.map((label) => <option key={label} value={label} />)}</datalist>
        <select value={strategyTeaching?.importance ?? "preferred"} onChange={(event) => setStrategyTeaching({ importance: event.target.value as StrategyAnnotation["importance"] })} style={{ background: theme.dark.bg2, color: theme.dark.text, border: `1px solid ${theme.dark.borderSoft}`, fontSize: 8 }}>
          <option value="required">Required</option><option value="preferred">Preferred</option><option value="informational">Note</option>
        </select>
        <select value={strategyTeaching?.trigger ?? "presence"} onChange={(event) => setStrategyTeaching({ trigger: event.target.value as StrategyAnnotation["trigger"] })} style={{ background: theme.dark.bg2, color: theme.dark.text, border: `1px solid ${theme.dark.borderSoft}`, fontSize: 8 }}>
          <option value="presence">Presence</option><option value="touch">Touch</option><option value="cross">Cross</option><option value="rejection">Rejection</option><option value="close_above">Close above</option><option value="close_below">Close below</option>
        </select>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{TOOLS.map((tool) => <TraderBlankButton key={tool.value} active={(strategyTeaching?.tool ?? "candle_group") === tool.value} onClick={() => setStrategyTeaching({ tool: tool.value })} style={{ padding: "5px 6px", fontSize: 8 }}>{tool.label}</TraderBlankButton>)}</div>
      <div style={{ maxHeight: 110, overflowY: "auto", scrollbarGutter: "stable", paddingRight: 5, borderTop: `1px solid ${theme.dark.borderSoft}` }}>
        {!ordered.length && <div style={{ color: theme.dark.hint, fontSize: 8, padding: "8px 0" }}>No semantic marks on this snapshot.</div>}
        {ordered.map((annotation, order) => <div key={annotation.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${theme.dark.borderSoft}`, fontSize: 8 }}>
          <span style={{ color: theme.dark.hint }}>{order + 1}</span><span style={{ color: theme.dark.text, flex: 1 }}>{annotation.label}</span>
          <span style={{ color: theme.dark.muted2 }}>{annotation.role.replace(/_/g, " ")}{annotation.kind === "marker" && annotation.candleIndex != null && annotation.priceAnchor ? ` · candle ${annotation.candleIndex + 1} ${annotation.priceAnchor}` : ""}</span>
          <button type="button" aria-label={`Remove ${annotation.label}`} onClick={() => setStrategyTeachingAnnotations(draft.filter((item) => item.id !== annotation.id))} style={{ flex: "0 0 18px", width: 18, height: 18, padding: 0, border: 0, background: "transparent", color: theme.dark.errorText, cursor: "pointer" }}>×</button>
        </div>)}
      </div>
      <TraderBlankButton active disabled={!dirty || saving} onClick={() => void save()} style={{ width: "100%", padding: 7 }}>{saving ? "Saving…" : dirty ? "Save teaching" : "Teaching saved"}</TraderBlankButton>
    </div>
  </section>;
}
