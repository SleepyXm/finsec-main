import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/app/UI/classnames";
import { MonoLabel } from "@/app/UI/components/LegacyPrimitives";
import { Surface } from "@/app/UI/components/Surface";
import styles from "./ToolPanel.module.css";

type StatusTone = "muted" | "accent" | "success" | "danger";

export function ToolPanel({
  title,
  subtitle,
  status,
  statusTone = "muted",
  active = false,
  headerActions,
  children,
  className,
  style,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  statusTone?: StatusTone;
  active?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Surface
      as="section"
      variant="inset"
      decorated
      className={cx(styles.panel, active && styles.active, className)}
      style={style}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <MonoLabel>{title}</MonoLabel>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
        {headerActions}
        {status && <span className={cx(styles.status, styles[statusTone])}>{status}</span>}
      </header>
      <div className={styles.body}>{children}</div>
    </Surface>
  );
}

