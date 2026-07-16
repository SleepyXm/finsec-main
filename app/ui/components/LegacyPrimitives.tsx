import Image from "next/image";
import React from "react";
import { theme, Theme, WHITE } from "../tokens";
import { traderBlankButtonStyle } from "../styles";
import { Corner } from "./Corner";
import styles from "./LegacyPrimitives.module.css";

type TraderBlankButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style"> & {
  active?: boolean; hovered?: boolean; cornerOpacity?: number; style?: React.CSSProperties;
};

export function TraderBlankButton({ active = false, hovered = false, cornerOpacity = 0.24, style, children, type = "button", ...props }: TraderBlankButtonProps) {
  return <button {...props} type={type} style={{ ...traderBlankButtonStyle({ active, hovered }), position: "relative", overflow: "hidden", ...style }}><Corner opacity={cornerOpacity} />{children}</button>;
}

export function MonoLabel({ children, t = theme.dark }: { children: React.ReactNode; t?: Theme }) {
  return <div className={styles.monoLabel} style={{ color: t.accent }}>{children}</div>;
}

export function Label({ children, t = theme.dark }: { children: React.ReactNode; t?: Theme }) {
  return <label className={styles.label} style={{ color: t.muted2 }}>{children}</label>;
}

export function Pill({ children, t = theme.dark }: { children: React.ReactNode; t?: Theme }) {
  return <span className={styles.pill} style={{ background: t.pill, color: t.pillText, borderColor: t.borderSoft }}><span className={styles.pillMark}>▸</span>{children}</span>;
}

export function ImgContainer({ src, alt = "" }: { src: string; alt?: string }) {
  return <div className={styles.imageContainer}><Corner /><Image src={src} alt={alt} fill className={styles.image} /><span aria-hidden="true" className={styles.imageShade} /></div>;
}

export function DotWave() {
  const rows = 18;
  const cols = 42;
  return <div className={styles.dotWave} style={{ gridTemplateColumns: `repeat(${cols}, 6px)` }}>{Array.from({ length: rows * cols }).map((_, index) => {
    const x = index % cols;
    const y = Math.floor(index / cols);
    const active = rows - y < Math.sin(x * 0.34) * 5 + Math.cos(x * 0.16) * 4 + 9;
    return <span key={index} className={styles.dot} style={{ width: active ? 5 : 2, height: active ? 5 : 2, background: active ? WHITE : "rgba(238,242,247,0.16)", opacity: active ? 0.95 : 0.42 }} />;
  })}</div>;
}
