import { CSSProperties } from "react";
import styles from "./Corner.module.css";

export function Corner({ opacity = 0.36 }: { opacity?: number }) {
  return <span aria-hidden="true" className={styles.corner} style={{ "--corner-opacity": opacity } as CSSProperties} />;
}
