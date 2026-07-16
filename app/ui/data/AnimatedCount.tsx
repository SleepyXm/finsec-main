"use client";

import { useEffect, useRef, useState } from "react";
import { Theme } from "../tokens";

export function DigitReel({ digit }: { digit: number }) {
  const height = 24;
  const [items, setItems] = useState(() => [digit]);
  const [offset, setOffset] = useState(0);
  const lastDigit = useRef(digit);

  useEffect(() => {
    const from = lastDigit.current;
    if (from === digit) return;
    const sequence = [from];
    let current = from;
    while (current !== digit) {
      current = (current + 1) % 10;
      sequence.push(current);
    }
    lastDigit.current = digit;
    let frame = 0;
    let settle = 0;
    const start = window.setTimeout(() => {
      setItems(sequence);
      setOffset(0);
      frame = requestAnimationFrame(() => setOffset(sequence.length - 1));
      settle = window.setTimeout(() => {
        setItems([digit]);
        setOffset(0);
      }, 120 + sequence.length * 45);
    }, 0);
    return () => {
      clearTimeout(start);
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [digit]);

  return (
    <span className="relative inline-block h-6 w-[0.65em] overflow-hidden align-bottom [mask-image:linear-gradient(to_bottom,transparent,black_28%,black_72%,transparent)]">
      <span className="block" style={{ transform: `translateY(-${offset * height}px)`, transition: offset === 0 ? "none" : `transform ${120 + items.length * 45}ms cubic-bezier(.16,1,.3,1)` }}>
        {items.map((number, index) => <span key={`${number}-${index}`} className="block h-6 text-center leading-6">{number}</span>)}
      </span>
    </span>
  );
}

export function AnimatedCount({ value, t }: { value: number; t: Theme }) {
  const chars = value.toLocaleString().split("");
  return (
    <div className="inline-flex h-6 items-center justify-center text-lg font-medium tabular-nums" style={{ color: t.text }}>
      {chars.map((char, index) => {
        if (!/\d/.test(char)) return <span key={`separator-${index}`} className="leading-6">{char}</span>;
        const key = `digit-${chars.slice(index + 1).filter((candidate) => /\d/.test(candidate)).length}`;
        return <DigitReel key={key} digit={Number(char)} />;
      })}
    </div>
  );
}
