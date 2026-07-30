"use client";

import { useState } from "react";
import { theme } from "../tokens";

export type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
};

export function QuantityStepper({ value, onChange, min = 1, max = Number.MAX_SAFE_INTEGER }: QuantityStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayedValue = draft ?? String(value);

  function update(next: number) {
    const safeValue = Math.min(max, Math.max(min, Math.floor(next)));
    setDraft(null);
    onChange(safeValue);
  }

  function commit() {
    const parsed = Number.parseInt(displayedValue, 10);
    update(Number.isFinite(parsed) ? parsed : min);
  }

  const stepButtonStyle = (disabled = false): React.CSSProperties => ({
    border: 0,
    background: "transparent",
    color: disabled ? theme.dark.hint : theme.dark.muted,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 10,
    lineHeight: 1,
    padding: 0,
  });

  return (
    <div className="grid h-7 grid-cols-[20px_15px] border border-white/10 bg-[#0e1117c7] text-[#EEF2F7]">
      <input
        type="text"
        role="spinbutton"
        aria-label="Trade quantity"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        inputMode="numeric"
        pattern="[0-9]*"
        value={displayedValue}
        onChange={(event) => {
          const next = event.target.value;
          if (!/^\d*$/.test(next)) return;
          setDraft(next);
          if (next) update(Number.parseInt(next, 10));
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            update(value + 1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            update(value - 1);
          } else if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className="min-w-0 border-0 bg-transparent p-0 text-center font-mono text-[11px] tabular-nums text-[#EEF2F7] outline-none"
      />
      <div className="grid grid-rows-2 border-l border-white/[0.07]">
        <button type="button" aria-label="Increase quantity" onClick={() => update(value + 1)} style={{ ...stepButtonStyle(), borderBottom: `1px solid ${theme.dark.borderSoft}` }}>+</button>
        <button type="button" aria-label="Decrease quantity" disabled={value <= min} onClick={() => update(value - 1)} style={stepButtonStyle(value <= min)}>−</button>
      </div>
    </div>
  );
}
