"use client";

import { useState, type CSSProperties } from "react";
import { theme } from "../tokens";

export type NumberStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  ariaLabel: string;
  increaseLabel?: string;
  decreaseLabel?: string;
  disabled?: boolean;
  style?: CSSProperties;
};

export function NumberStepper({
  value,
  onChange,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  integer = false,
  ariaLabel,
  increaseLabel = `Increase ${ariaLabel.toLowerCase()}`,
  decreaseLabel = `Decrease ${ariaLabel.toLowerCase()}`,
  disabled = false,
  style,
}: NumberStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const currentValue = Number.isFinite(value)
    ? value
    : Math.min(max, Math.max(min, 0));
  const displayedValue = draft ?? String(currentValue);

  function normalise(next: number) {
    const rounded = integer ? Math.trunc(next) : Number(next.toPrecision(12));
    return Math.min(max, Math.max(min, rounded));
  }

  function update(next: number, clearDraft = true) {
    const safeValue = normalise(next);
    if (clearDraft) setDraft(null);
    onChange(safeValue);
  }

  function commit() {
    const parsed = Number(displayedValue);
    update(Number.isFinite(parsed) ? parsed : currentValue);
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
    <div
      className="grid h-7 border border-white/10 bg-[#0e1117c7] text-[#EEF2F7]"
      style={{ width: 50, gridTemplateColumns: "minmax(0, 1fr) 20px", ...style }}
    >
      <input
        type="text"
        role="spinbutton"
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={currentValue}
        inputMode={integer ? "numeric" : "decimal"}
        pattern={integer ? "-?[0-9]*" : "-?[0-9]*[.]?[0-9]*"}
        value={displayedValue}
        disabled={disabled}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const next = event.target.value;
          const pattern = integer ? /^-?\d*$/ : /^-?\d*(?:\.\d*)?$/;
          if (!pattern.test(next)) return;
          setDraft(next);
          const parsed = Number(next);
          if (next !== "" && next !== "-" && next !== "." && next !== "-.") {
            update(parsed, false);
          }
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            update(currentValue + step);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            update(currentValue - step);
          } else if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className="min-w-0 border-0 bg-transparent p-0 text-center font-mono text-[11px] tabular-nums text-[#EEF2F7] outline-none"
      />
      <div className="grid grid-rows-2 border-l border-white/[0.07]">
        <button type="button" aria-label={increaseLabel} disabled={disabled || currentValue >= max} onClick={() => update(currentValue + step)} style={{ ...stepButtonStyle(disabled || currentValue >= max), borderBottom: `1px solid ${theme.dark.borderSoft}` }}>+</button>
        <button type="button" aria-label={decreaseLabel} disabled={disabled || currentValue <= min} onClick={() => update(currentValue - step)} style={stepButtonStyle(disabled || currentValue <= min)}>−</button>
      </div>
    </div>
  );
}

export type QuantityStepperProps = Pick<
  NumberStepperProps,
  "value" | "onChange" | "min" | "max" | "disabled" | "style"
>;

export function QuantityStepper(props: QuantityStepperProps) {
  return (
    <NumberStepper
      {...props}
      min={props.min ?? 1}
      step={1}
      integer
      ariaLabel="Trade quantity"
      increaseLabel="Increase quantity"
      decreaseLabel="Decrease quantity"
    />
  );
}
