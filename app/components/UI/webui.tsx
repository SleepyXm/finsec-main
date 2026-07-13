import { useEffect, useRef, useState } from "react";
import { theme } from "./UI";


// ─── Quantity stepper ────────────────────────────────────────────────────────

export function QuantityStepper({
  value,
  onChange,
  min = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  function update(next: number) {
    const safeValue = Math.max(min, Math.floor(next));
    setDraft(String(safeValue));
    onChange(safeValue);
  }

  function commit() {
    const parsed = Number.parseInt(draft, 10);
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
    <div style={{
      display: "grid",
      gridTemplateColumns: "30px 20px",
      height: 28,
      background: "rgba(14,17,23,0.78)",
      border: `1px solid ${theme.dark.border}`,
      color: theme.dark.text,
    }}>
      <input
        type="text"
        role="spinbutton"
        aria-label="Trade quantity"
        aria-valuemin={min}
        aria-valuenow={value}
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          if (!/^\d*$/.test(next)) return;
          setDraft(next);
          if (next) onChange(Math.max(min, Number.parseInt(next, 10)));
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
        style={{
          width: "100%",
          minWidth: 0,
          border: 0,
          borderRadius: 0,
          outline: "none",
          background: "transparent",
          color: theme.dark.text,
          textAlign: "center",
          fontFamily: "var(--font-code), monospace",
          fontSize: 11,
          fontVariantNumeric: "tabular-nums",
          padding: 0,
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateRows: "1fr 1fr",
          borderLeft: `1px solid ${theme.dark.borderSoft}`,
        }}
      >
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={() => update(value + 1)}
          style={{
            ...stepButtonStyle(),
            borderBottom: `1px solid ${theme.dark.borderSoft}`,
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Decrease quantity"
          disabled={value <= min}
          onClick={() => update(value - 1)}
          style={stepButtonStyle(value <= min)}
        >
          −
        </button>
      </div>
    </div>
  );
}


// ─── Digit reel ─────────────────────────────────────────────────────────────

export function DigitReel({ digit }: { digit: number }) {
  const height = 24;
  const [items, setItems] = useState([0]);
  const [offset, setOffset] = useState(0);
  const lastDigit = useRef(0);

  useEffect(() => {
    const from = lastDigit.current;
    const to = digit;

    if (from === to) {
      setItems([to]);
      setOffset(0);
      return;
    }

    const sequence: number[] = [];
    let current = from;
    sequence.push(current);
    while (current !== to) {
      current = (current + 1) % 10;
      sequence.push(current);
    }
    lastDigit.current = to;
    setItems(sequence);
    setOffset(0);

    const frame = requestAnimationFrame(() => setOffset(sequence.length - 1));
    const duration = 120 + sequence.length * 45;
    const timeout = window.setTimeout(() => {
      setItems([to]);
      setOffset(0);
    }, duration);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [digit]);

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: "0.65em",
        height,
        overflow: "hidden",
        verticalAlign: "bottom",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent, black 28%, black 72%, transparent)",
        maskImage:
          "linear-gradient(to bottom, transparent, black 28%, black 72%, transparent)",
      }}
    >
      <span
        style={{
          display: "block",
          transform: `translateY(-${offset * height}px)`,
          transition:
            offset === 0
              ? "none"
              : `transform ${120 + items.length * 45}ms cubic-bezier(.16, 1, .3, 1)`,
        }}
      >
        {items.map((n, i) => (
          <span
            key={`${n}-${i}`}
            style={{
              display: "block",
              height,
              lineHeight: `${height}px`,
              textAlign: "center",
            }}
          >
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

export function AnimatedCount({ value, t }: { value: number; t: any }) {
  const formatted = value.toLocaleString();
  const chars = formatted.split("");
  let digitPlace = chars.filter((c) => /\d/.test(c)).length - 1;

  return (
    <div
      style={{
        height: 24,
        fontSize: 18,
        fontWeight: 500,
        color: t.text,
        fontVariantNumeric: "tabular-nums",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {chars.map((char, i) => {
        if (!/\d/.test(char)) {
          return (
            <span key={`sep-${i}`} style={{ lineHeight: "24px" }}>
              {char}
            </span>
          );
        }
        const key = `digit-${digitPlace}`;
        digitPlace -= 1;
        return <DigitReel key={key} digit={Number(char)} />;
      })}
    </div>
  );
}
