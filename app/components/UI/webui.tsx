import { useEffect, useRef, useState } from "react";


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