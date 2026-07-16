import { HTMLAttributes } from "react";
import { cx } from "../classnames";
import { Corner } from "./Corner";
import styles from "./Surface.module.css";

export type SurfaceVariant = "card" | "panel" | "trader" | "inset";
export type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "aside";
  variant?: SurfaceVariant;
  decorated?: boolean;
  cornerOpacity?: number;
};

export function Surface({ as: Component = "div", variant = "panel", decorated = false, cornerOpacity = 0.36, className, children, ...props }: SurfaceProps) {
  return <Component {...props} className={cx(styles.surface, styles[variant], className)}>{decorated && <Corner opacity={cornerOpacity} />}{children}</Component>;
}
