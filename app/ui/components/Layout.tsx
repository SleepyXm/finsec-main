import { CSSProperties, HTMLAttributes } from "react";
import { cx } from "../classnames";
import styles from "./Layout.module.css";

type LayoutProps = HTMLAttributes<HTMLDivElement> & { gap?: "xs" | "sm" | "md" | "lg" | "xl" };
export function Stack({ gap = "md", className, ...props }: LayoutProps) { return <div {...props} className={cx(styles.stack, styles[gap], className)} />; }
export function Cluster({ gap = "md", className, ...props }: LayoutProps) { return <div {...props} className={cx(styles.cluster, styles[gap], className)} />; }
export function Grid({ gap = "md", className, style, minColumnWidth = "16rem", ...props }: LayoutProps & { minColumnWidth?: string }) { return <div {...props} className={cx(styles.grid, styles[gap], className)} style={{ "--grid-min": minColumnWidth, ...style } as CSSProperties} />; }
export function PageShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx(styles.page, className)} />; }
