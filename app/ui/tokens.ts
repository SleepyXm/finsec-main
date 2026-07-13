export const ACCENT = "#8FAADC";
export const ACCENT_SOFT = "rgba(143,170,220,0.12)";
export const WHITE = "#EEF2F7";
export const ACCENT_2 = "#5F7FB8";
export const DANGER = "#C77D7D";
export const SUCCESS = "#8DBFA3";

export const theme = {
  light: {
    bg: "#F3F4F6", bg2: "#E7EAF0", bg3: "#DDE2EA",
    surface: "#FFFFFF", surface2: "#F4F6F9", surface3: "#E9EDF3",
    border: "rgba(15,23,42,0.12)", borderSoft: "rgba(15,23,42,0.07)", borderStrong: "rgba(15,23,42,0.22)",
    text: "#10141C", muted: "rgba(16,20,28,0.58)", muted2: "rgba(16,20,28,0.38)", hint: "rgba(16,20,28,0.18)",
    accent: ACCENT, accentSoft: "rgba(143,170,220,0.16)", accentBorder: "rgba(95,127,184,0.28)",
    btn: "#10141C", btnText: "#F3F4F6",
    pill: "rgba(15,23,42,0.045)", pillText: "#10141C",
    success: "rgba(141,191,163,0.16)", successText: "#35694B",
    errorBg: "rgba(199,125,125,0.12)", errorText: "#9F3F3F",
  },
  dark: {
    bg: "#0E1117", bg2: "#131821", bg3: "#1A202B",
    surface: "#131821", surface2: "#181F2A", surface3: "#202838",
    border: "rgba(238,242,247,0.12)", borderSoft: "rgba(238,242,247,0.07)", borderStrong: "rgba(238,242,247,0.22)",
    text: WHITE, muted: "rgba(238,242,247,0.66)", muted2: "rgba(238,242,247,0.42)", hint: "rgba(238,242,247,0.22)",
    accent: ACCENT, accentSoft: ACCENT_SOFT, accentBorder: "rgba(143,170,220,0.34)",
    btn: ACCENT, btnDiff: WHITE, btnText: "#0E1117",
    pill: "rgba(238,242,247,0.045)", pillText: WHITE,
    success: "rgba(141,191,163,0.12)", successText: "#B8DCC5",
    errorBg: "rgba(199,125,125,0.12)", errorText: "#E2A1A1",
  },
} as const;

export type Theme = (typeof theme)[keyof typeof theme];
