import "../../animations.css";
import type React from "react";

export const REFERRALS = [
  { value: "search", label: "Search engine" },
  { value: "reddit", label: "Reddit" },
  { value: "linkedin", label: "LinkedIn" },
];

export const FEATURES = [
  "Real-time data",
  "Strategy automation",
  "Bar replay",
  "Backtesting",
  "Risk controls",
  "Execution logs",
];

export const ACCENT = "#8FAADC";
export const ACCENT_SOFT = "rgba(143,170,220,0.12)";
export const WHITE = "#EEF2F7";

export const ACCENT_2 = "#5F7FB8";
export const DANGER = "#C77D7D";
export const SUCCESS = "#8DBFA3";

export const theme = {
  light: {
    bg: "#F3F4F6",
    bg2: "#E7EAF0",
    bg3: "#DDE2EA",

    surface: "#FFFFFF",
    surface2: "#F4F6F9",
    surface3: "#E9EDF3",

    border: "rgba(15,23,42,0.12)",
    borderSoft: "rgba(15,23,42,0.07)",
    borderStrong: "rgba(15,23,42,0.22)",

    text: "#10141C",
    muted: "rgba(16,20,28,0.58)",
    muted2: "rgba(16,20,28,0.38)",
    hint: "rgba(16,20,28,0.18)",

    accent: ACCENT,
    accentSoft: "rgba(143,170,220,0.16)",
    accentBorder: "rgba(95,127,184,0.28)",

    btn: "#10141C",
    btnText: "#F3F4F6",

    pill: "rgba(15,23,42,0.045)",
    pillText: "#10141C",

    success: "rgba(141,191,163,0.16)",
    successText: "#35694B",

    errorBg: "rgba(199,125,125,0.12)",
    errorText: "#9F3F3F",
  },

  dark: {
    bg: "#0E1117",
    bg2: "#131821",
    bg3: "#1A202B",

    surface: "#131821",
    surface2: "#181F2A",
    surface3: "#202838",

    border: "rgba(238,242,247,0.12)",
    borderSoft: "rgba(238,242,247,0.07)",
    borderStrong: "rgba(238,242,247,0.22)",

    text: "#EEF2F7",
    muted: "rgba(238,242,247,0.66)",
    muted2: "rgba(238,242,247,0.42)",
    hint: "rgba(238,242,247,0.22)",

    accent: ACCENT,
    accentSoft: ACCENT_SOFT,
    accentBorder: "rgba(143,170,220,0.34)",

    btn: ACCENT,
    btnText: "#0E1117",

    pill: "rgba(238,242,247,0.045)",
    pillText: "#EEF2F7",

    success: "rgba(141,191,163,0.12)",
    successText: "#B8DCC5",

    errorBg: "rgba(199,125,125,0.12)",
    errorText: "#E2A1A1",
  },
};

export const pageStyle: React.CSSProperties = {
  background:
    "radial-gradient(circle at 15% 10%, rgba(143,170,220,0.10), transparent 28%), linear-gradient(180deg, #0E1117 0%, #131821 45%, #0E1117 100%)",
  color: theme.dark.text,
  minHeight: "100vh",
  fontFamily: "var(--font-display), system-ui, sans-serif",
  overflowX: "hidden",
};

export const sectionStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderTop: "1px solid rgba(238,242,247,0.07)",
};

export const handleGridGlowMove = (e: React.MouseEvent<HTMLElement>) => {
  const rect = e.currentTarget.getBoundingClientRect();

  e.currentTarget.style.setProperty(
    "--grid-x",
    `${e.clientX - rect.left}px`
  );

  e.currentTarget.style.setProperty(
    "--grid-y",
    `${e.clientY - rect.top}px`
  );
};

export const gridBgStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    "linear-gradient(rgba(238,242,247,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(238,242,247,0.045) 1px, transparent 1px)",
  backgroundSize: "72px 72px",
  maskImage: "linear-gradient(to bottom, black, transparent 85%)",
  WebkitMaskImage: "linear-gradient(to bottom, black, transparent 85%)",
  opacity: 0.38,
  pointerEvents: "none",
};

export const liquidPageStyle = pageStyle;
export const liquidSectionStyle = sectionStyle;

export const liquidOrbStyle = (
  top: string,
  left: string,
  size: number,
  opacity = 0.08
): React.CSSProperties => ({
  position: "absolute",
  top,
  left,
  width: size,
  height: size,
  borderRadius: "999px",
  background: "radial-gradient(circle, rgba(143,170,220,0.18), transparent 64%)",
  filter: "blur(60px)",
  opacity,
  pointerEvents: "none",
});

export const cardStyle = (t = theme.dark): React.CSSProperties => ({
  position: "relative",
  background: t.surface,
  border: `1px solid ${t.borderSoft}`,
  borderRadius: 0,
});

export const panelStyle = (t = theme.dark): React.CSSProperties => ({
  position: "relative",
  background:
    "linear-gradient(180deg, rgba(238,242,247,0.035), rgba(238,242,247,0.015))",
  border: `1px solid ${t.borderSoft}`,
  borderRadius: 0,
  backdropFilter: "blur(3px)",
  WebkitBackdropFilter: "blur(3px)", // Safari needs the prefixed version
});

export const glassCardStyle = panelStyle;

export const glowCardStyle = (t = theme.dark): React.CSSProperties => ({
  ...panelStyle(t),
  boxShadow: "none",
});

export const cornerStyle = (): React.CSSProperties => ({
  position: "absolute",
  inset: -1,
  pointerEvents: "none",
  background:
    "linear-gradient(to right, rgba(238,242,247,0.36) 1px, transparent 1px) 0 0 / 14px 14px no-repeat, linear-gradient(to bottom, rgba(238,242,247,0.36) 1px, transparent 1px) 0 0 / 14px 14px no-repeat, linear-gradient(to left, rgba(238,242,247,0.36) 1px, transparent 1px) 100% 0 / 14px 14px no-repeat, linear-gradient(to bottom, rgba(238,242,247,0.36) 1px, transparent 1px) 100% 0 / 14px 14px no-repeat, linear-gradient(to right, rgba(238,242,247,0.36) 1px, transparent 1px) 0 100% / 14px 14px no-repeat, linear-gradient(to top, rgba(238,242,247,0.36) 1px, transparent 1px) 0 100% / 14px 14px no-repeat, linear-gradient(to left, rgba(238,242,247,0.36) 1px, transparent 1px) 100% 100% / 14px 14px no-repeat, linear-gradient(to top, rgba(238,242,247,0.36) 1px, transparent 1px) 100% 100% / 14px 14px no-repeat",
});

export const buttonStyle = (t = theme.dark): React.CSSProperties => ({
  background: t.accent,
  color: t.btnText,
  border: "none",
  borderRadius: 0,
  padding: "0.85rem 1.25rem",
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  cursor: "pointer",
  transition: "transform 0.18s ease, opacity 0.18s ease",
});

export const ghostButtonStyle = (t = theme.dark): React.CSSProperties => ({
  background: "transparent",
  color: t.text,
  border: `1px solid ${t.border}`,
  borderRadius: 0,
  padding: "0.85rem 1.25rem",
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  cursor: "pointer",
  transition: "transform 0.18s ease, border-color 0.18s ease",
});

export function MonoLabel({
  children,
  t = theme.dark,
}: {
  children: React.ReactNode;
  t?: any;
}) {
  return (
    <div
      style={{
        fontFamily: "var(--font-code), monospace",
        fontSize: 11,
        letterSpacing: 1.1,
        color: t.accent,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

export function Label({ children, t }: { children: React.ReactNode; t: any }) {
  return (
    <label
      style={{
        fontFamily: "var(--font-code), monospace",
        fontSize: 11,
        color: t.muted2,
        display: "block",
        marginBottom: 6,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

export function Pill({ children, t }: { children: React.ReactNode; t: any }) {
  return (
    <span
      style={{
        background: t.pill,
        color: t.pillText,
        border: `1px solid ${t.borderSoft}`,
        padding: "0.45rem 0.7rem",
        fontSize: 11,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-code), monospace",
        letterSpacing: 0.2,
      }}
    >
      <span style={{ color: t.accent }}>▸</span>
      {children}
    </span>
  );
}

export function ImgContainer({ src, alt = "" }: { src: string; alt?: string }) {
  return (
    <div
      style={{
        ...panelStyle(theme.dark),
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={cornerStyle()} />

      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          opacity: 0.72,
          filter: "grayscale(0.2) contrast(1.05)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(14,17,23,0), rgba(14,17,23,0.42))",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export function DotWave() {
  const rows = 18;
  const cols = 42;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 6px)`,
        gap: 7,
        justifyContent: "center",
        alignItems: "end",
        opacity: 0.95,
      }}
    >
      {Array.from({ length: rows * cols }).map((_, i) => {
        const x = i % cols;
        const y = Math.floor(i / cols);
        const wave = Math.sin(x * 0.34) * 5 + Math.cos(x * 0.16) * 4 + 9;
        const active = rows - y < wave;

        return (
          <span
            key={i}
            style={{
              width: active ? 5 : 2,
              height: active ? 5 : 2,
              borderRadius: 999,
              background: active ? WHITE : "rgba(238,242,247,0.16)",
              display: "block",
              opacity: active ? 0.95 : 0.42,
            }}
          />
        );
      })}
    </div>
  );
}


