"use client";

import { useState } from "react";
import { ChartTheme } from "../themes/themes";
import { ColorPicker } from "./ColorPicker";

type ThemeColorKey = {
  [Key in keyof ChartTheme]: ChartTheme[Key] extends string ? Key : never;
}[keyof ChartTheme];

const BASE_COLORS = [
  { label: "Text", key: "text" },
  { label: "Grid", key: "grid" },
  { label: "Crosshair", key: "crosshair" },
] as const satisfies ReadonlyArray<{ label: string; key: ThemeColorKey }>;

const CANDLE_COLOR_PAIRS = [
  { label: "Candle", keys: ["bullCandle", "bearCandle"] },
  { label: "Border", keys: ["borderUpColor", "borderDownColor"] },
  { label: "Wick", keys: ["wickUpColor", "wickDownColor"] },
  { label: "Positions", keys: ["longPosition", "shortPosition"] },
] as const satisfies ReadonlyArray<{
  label: string;
  keys: readonly [ThemeColorKey, ThemeColorKey];
}>;

const LINE_COLORS = [
  { label: "Line Up", key: "lineUp" },
  { label: "Line Down", key: "lineDown" },
  { label: "Area Top Up", key: "areaTopUp" },
  { label: "Area Top Down", key: "areaTopDown" },
  { label: "Area Bottom Up", key: "areaBottomUp" },
  { label: "Area Bottom Down", key: "areaBottomDown" },
] as const satisfies ReadonlyArray<{ label: string; key: ThemeColorKey }>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-300">{label}</span>
      {children}
    </div>
  );
}

function ColorSwatch({ value, onChange, wide = false }: {
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <div className={`relative ${wide ? "w-17" : "w-7"} h-7 rounded overflow-hidden border border-white/15`}>
      <div className="absolute inset-0" style={{ background: value }} />
      <ColorPicker value={value} onChange={onChange} />
    </div>
  );
}

export function ChartThemeModal({ isCandle, theme, onSave, onClose }: {
  isCandle: boolean;
  theme: ChartTheme;
  onSave: (overrides: Partial<ChartTheme>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Partial<ChartTheme>>({});
  const merged = { ...theme, ...draft };
  const set = <Key extends keyof ChartTheme>(key: Key, value: ChartTheme[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const colorRow = ({ label, key }: { label: string; key: ThemeColorKey }) => (
    <Row key={key} label={label}>
      <ColorSwatch wide value={merged[key]} onChange={(value) => set(key, value)} />
    </Row>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#222222] text-white rounded-xl p-6 w-160 flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold tracking-wide uppercase text-gray-200 border-b border-[#00000020] pb-2">
          Chart Theme
        </h2>

        <Row label="Background">
          <div className="flex items-center gap-2">
            <select
              className="bg-white/6 border border-white/12 rounded-md text-white/80 text-[11px] px-2 py-1 focus:outline-none"
              value={merged.background.type}
              onChange={(event) => {
                const type = event.target.value;
                if (type === "solid") set("background", { type: "solid", color: "#000000" });
                if (type === "gradient") set("background", { type: "gradient", topColor: "#1d2129", bottomColor: "#0a0e14" });
                if (type === "transparent") set("background", { type: "transparent" });
              }}
            >
              <option value="solid">Solid</option>
              <option value="gradient">Gradient</option>
              <option value="transparent">None</option>
            </select>

            {merged.background.type === "solid" && (
              <ColorSwatch
                wide
                value={merged.background.color}
                onChange={(color) => set("background", { type: "solid", color })}
              />
            )}
            {merged.background.type === "gradient" && (
              <div className="flex items-center gap-1.5">
                <ColorSwatch
                  value={merged.background.topColor}
                  onChange={(topColor) => {
                    if (merged.background.type === "gradient") {
                      set("background", { ...merged.background, topColor });
                    }
                  }}
                />
                <span className="text-white/30 text-xs">→</span>
                <ColorSwatch
                  value={merged.background.bottomColor}
                  onChange={(bottomColor) => {
                    if (merged.background.type === "gradient") {
                      set("background", { ...merged.background, bottomColor });
                    }
                  }}
                />
              </div>
            )}
          </div>
        </Row>

        {BASE_COLORS.map(colorRow)}
        {isCandle
          ? CANDLE_COLOR_PAIRS.map(({ label, keys }) => (
              <Row key={label} label={label}>
                <div className="flex gap-2">
                  {keys.map((key) => (
                    <ColorSwatch key={key} value={merged[key]} onChange={(value) => set(key, value)} />
                  ))}
                </div>
              </Row>
            ))
          : LINE_COLORS.map(colorRow)}

        <div className="flex gap-2 mt-2">
          <button className="flex-1 py-2 rounded-lg bg-gray-700 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="flex-1 py-2 rounded-lg bg-blue-600 text-sm font-semibold"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
