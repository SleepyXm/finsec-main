import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from "react-dom";

interface HSVa { h: number; s: number; v: number; a: number; }

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

function rgbToHex(r: number, g: number, b: number) {
  return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function colorToHsva(color: string): HSVa {
  const rgba = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgba) {
    const [h, s, v] = rgbToHsv(+rgba[1], +rgba[2], +rgba[3]);
    return { h, s, v, a: rgba[4] !== undefined ? +rgba[4] : 1 };
  }
  const hex = color.replace('#', '');
  if (hex.length >= 6) {
    const [h, s, v] = rgbToHsv(...hexToRgb(hex));
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { h, s, v, a };
  }
  return { h: 0, s: 0, v: 1, a: 1 };
}

function hsvaToString(hsva: HSVa): string {
  const [r, g, b] = hsvToRgb(hsva.h, hsva.s, hsva.v);
  if (hsva.a < 1) return `rgba(${r},${g},${b},${hsva.a.toFixed(2)})`;
  return '#' + rgbToHex(r, g, b);
}

const SWATCHES = [
  '#089981', '#f23645', '#2962FF', '#e8e8e8',
  '#f5a623', '#c2c2c2', '#000000', '#ffffff',
  '#26a69a', '#ef5350', '#1d2129', '#0a0e14',
  '#444444', '#7b61ff', '#ff6b6b', '#ffd93d',
];

function useDrag(onDrag: (x: number, y: number, rect: DOMRect) => void) {
  return useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const handle = (ev: MouseEvent) => {
      onDrag(ev.clientX, ev.clientY, el.getBoundingClientRect());
    };
    handle(e.nativeEvent);
    window.addEventListener('mousemove', handle);
    window.addEventListener('mouseup', () => {
      window.removeEventListener('mousemove', handle);
    }, { once: true });
  }, [onDrag]);
}

export const ColorPicker: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const swatchRef = useRef<HTMLDivElement>(null);

  const [hsva, setHsva] = useState<HSVa>(() => colorToHsva(value));
  const [hexInput, setHexInput] = useState('');
  const [alphaInput, setAlphaInput] = useState('');
  const satRef = useRef<HTMLCanvasElement>(null);
  const hueRef = useRef<HTMLCanvasElement>(null);
  const alphaRef = useRef<HTMLCanvasElement>(null);

  const [r, g, b] = hsvToRgb(hsva.h, hsva.s, hsva.v);

  const emit = useCallback((next: HSVa) => {
    setHsva(next);
    onChange(hsvaToString(next));
  }, [onChange]);

  useEffect(() => { setHsva(colorToHsva(value)); }, [value]);
  useEffect(() => {
    setHexInput(rgbToHex(r, g, b));
    setAlphaInput(String(Math.round(hsva.a * 100)));
  }, [r, g, b, hsva.a]);

  useEffect(() => {
    const canvas = satRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    const [hr, hg, hb] = hsvToRgb(hsva.h, 1, 1);
    const g1 = ctx.createLinearGradient(0, 0, W, 0);
    g1.addColorStop(0, '#fff');
    g1.addColorStop(1, `rgb(${hr},${hg},${hb})`);
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createLinearGradient(0, 0, 0, H);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, '#000');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  }, [hsva.h, open]); // re-draw when opened

  useEffect(() => {
    const canvas = hueRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    for (let i = 0; i <= 360; i += 30) grad.addColorStop(i / 360, `hsl(${i},100%,50%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [open]);

  useEffect(() => {
    const canvas = alphaRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},1)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [r, g, b, open]);

  const onSatDrag = useDrag((x, y, rect) => {
    emit({ ...hsva, s: Math.max(0, Math.min(1, (x - rect.left) / rect.width)), v: Math.max(0, Math.min(1, 1 - (y - rect.top) / rect.height)) });
  });
  const onHueDrag = useDrag((x, y, rect) => {
    emit({ ...hsva, h: Math.max(0, Math.min(360, ((x - rect.left) / rect.width) * 360)) });
  });
  const onAlphaDrag = useDrag((x, y, rect) => {
    emit({ ...hsva, a: Math.max(0, Math.min(1, (x - rect.left) / rect.width)) });
  });

  const handleSwatchClick = () => {
    if (swatchRef.current) {
      const rect = swatchRef.current.getBoundingClientRect();
      // Try to show picker below, but flip up if too close to bottom
      const spaceBelow = window.innerHeight - rect.bottom;
      const pickerHeight = 320; // approx
      const top = spaceBelow > pickerHeight
        ? rect.bottom + 6
        : rect.top - pickerHeight - 6;
      setPos({ top, left: rect.left });
    }
    setOpen(v => !v);
  };

  const cursorDark = hsva.v > 0.5 && hsva.s < 0.5;

  const picker = (
    <>
      <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
      <div
        className="fixed z-[101] bg-[#0f1117] border border-white/10 rounded-xl overflow-hidden w-[260px]"
        style={{ top: pos.top, left: pos.left, fontFamily: "'DM Mono', monospace" }}
      >
        <div className="relative cursor-crosshair" onMouseDown={onSatDrag}>
          <canvas ref={satRef} width={260} height={160} className="w-full block" />
          <div
            className="absolute w-3 h-3 rounded-full border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${hsva.s * 100}%`,
              top: `${(1 - hsva.v) * 100}%`,
              boxShadow: cursorDark ? '0 0 0 1px rgba(0,0,0,0.4)' : '0 0 0 1px rgba(255,255,255,0.4)',
            }}
          />
        </div>

        <div className="px-3.5 py-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md border border-white/15 flex-shrink-0"
              style={{ background: `rgba(${r},${g},${b},${hsva.a})` }}
            />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="relative h-2.5 rounded cursor-pointer" onMouseDown={onHueDrag}>
                <canvas ref={hueRef} width={220} height={10} className="w-full h-full block rounded" />
                <div
                  className="absolute top-1/2 w-3 h-[18px] rounded-sm border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${(hsva.h / 360) * 100}%` }}
                />
              </div>
              <div
                className="relative h-2.5 rounded cursor-pointer"
                style={{
                  backgroundImage: 'linear-gradient(45deg, #555 25%, transparent 25%), linear-gradient(-45deg, #555 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #555 75%), linear-gradient(-45deg, transparent 75%, #555 75%)',
                  backgroundSize: '6px 6px',
                  backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
                }}
                onMouseDown={onAlphaDrag}
              >
                <canvas ref={alphaRef} width={220} height={10} className="w-full h-full block rounded relative z-10" />
                <div
                  className="absolute top-1/2 w-3 h-[18px] rounded-sm border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2 z-20"
                  style={{ left: `${hsva.a * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/30 tracking-wider">#</span>
            <input
              className="bg-white/6 border border-white/12 rounded-md text-white/80 text-[11px] px-2 py-1 w-20 tracking-wider focus:outline-none focus:border-white/30"
              value={hexInput}
              onChange={e => setHexInput(e.target.value.replace('#', '').toUpperCase())}
              onBlur={() => {
                if (hexInput.length === 6) {
                  const [hr, hgv, hb] = hexToRgb(hexInput);
                  const [nh, ns, nv] = rgbToHsv(hr, hgv, hb);
                  emit({ ...hsva, h: nh, s: ns, v: nv });
                }
              }}
              maxLength={6}
            />
            <span className="text-[10px] text-white/30 ml-auto">A</span>
            <input
              className="bg-white/6 border border-white/12 rounded-md text-white/80 text-[11px] px-2 py-1 w-11 tracking-wider focus:outline-none focus:border-white/30"
              value={alphaInput}
              onChange={e => setAlphaInput(e.target.value)}
              onBlur={() => {
                const parsed = Math.max(0, Math.min(100, parseInt(alphaInput) || 0));
                emit({ ...hsva, a: parsed / 100 });
              }}
              maxLength={3}
            />
            <span className="text-[10px] text-white/30">%</span>
          </div>

          <div className="grid grid-cols-8 gap-1">
            {SWATCHES.map(hex => (
              <button
                key={hex}
                className="aspect-square rounded w-full border border-white/8 hover:scale-110 transition-transform"
                style={{ background: hex }}
                onClick={() => {
                  const [hr, hg, hb] = hexToRgb(hex.replace('#', ''));
                  const [nh, ns, nv] = rgbToHsv(hr, hg, hb);
                  emit({ ...hsva, h: nh, s: ns, v: nv });
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Swatch trigger — sits inside your existing wrapper div */}
      <div
        ref={swatchRef}
        className="absolute inset-0 cursor-pointer"
        onClick={handleSwatchClick}
      />
      {open && createPortal(picker, document.body)}
    </>
  );
};
