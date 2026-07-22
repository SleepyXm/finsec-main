"use client";

import type { CSSProperties } from "react";
import { cx } from "@/app/UI/classnames";
import { TraderBlankButton } from "@/app/UI/components/LegacyPrimitives";
import { ToolPanel } from "@/app/UI/components/ToolPanel";
import styles from "./ActionPanel.module.css";

export function ActionPanel({
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
    <ToolPanel
      title={title}
      status={active ? "Annotating" : "Ready"}
      statusTone={active ? "accent" : "muted"}
      active={active}
      style={style}
    >
      <div className={cx(styles.description, onToggle && styles.withAction)}>{description}</div>
      {onToggle && (
        <TraderBlankButton active={active} onClick={onToggle} className={styles.action}>
          {active ? "Stop annotating" : "Start annotating"}
        </TraderBlankButton>
      )}
      {active && <div className={styles.hint}>{activeHint}</div>}
    </ToolPanel>
  );
}

