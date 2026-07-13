import type { ButtonHTMLAttributes } from "react";
import { cx } from "../classnames";
import { Corner } from "./Corner";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  rounded?: boolean;
  decorated?: boolean;
};

export function Button({ variant = "primary", size = "md", fullWidth = false, rounded = false, decorated = false, className, children, type = "button", ...props }: ButtonProps) {
  return (
    <button {...props} type={type} className={cx(styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, rounded && styles.rounded, className)}>
      {decorated && <Corner opacity={0.24} />}
      {children}
    </button>
  );
}
