"use client";

import type { CSSProperties } from "react";
import { cornerStyle, MonoLabel, theme, traderInsetPanelStyle, TraderBlankButton } from "@/app/UI";

export const strategyCardBackground = "rgba(238,242,247,0.025)";

export function StrategyCaptureSection({
  title,
  active,
  description,
  activeHint,
  onToggle,
  style,
}: {
  title: string;
  active: boolean;
  description: string;
  activeHint: string;
  onToggle?: () => void;
  style?: CSSProperties;
}) {
  return (
    <section style={{
      ...traderInsetPanelStyle(theme.dark),
      borderColor: active ? theme.dark.accentBorder : theme.dark.borderSoft,
      ...style,
    }}>
      <div style={cornerStyle()} />
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "9px 10px", borderBottom: `1px solid ${theme.dark.borderSoft}`,
      }}>
        <MonoLabel>{title}</MonoLabel>
        <span style={{
          color: active ? theme.dark.accent : theme.dark.muted2,
          fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          {active ? "Annotating" : "Ready"}
        </span>
      </header>
      <div style={{ padding: 10 }}>
        <div style={{ color: theme.dark.muted2, fontSize: 10, marginBottom: onToggle ? 9 : 0 }}>
          {description}
        </div>
        {onToggle && (
          <TraderBlankButton
            active={active}
            onClick={onToggle}
            style={{ width: "100%", padding: "8px 10px", fontSize: 10, letterSpacing: "0.04em" }}
          >
            {active ? "Stop annotating" : "Start annotating"}
          </TraderBlankButton>
        )}
        {active && <div style={{ color: theme.dark.accent, fontSize: 9, marginTop: 8 }}>{activeHint}</div>}
      </div>
    </section>
  );
}
