import { useEffect, useRef, useCallback } from 'react';
import type { ValidationState } from "@/app/features/StrategyEngine/types";

interface CandleHighlightOptions {
  chartRef: React.MutableRefObject<any>;
  seriesRef: React.MutableRefObject<any>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  data: any[];
  active: boolean; // only paints when isCreatingStrategy or whatever condition
  validation?: ValidationState;
}

export function useCandleHighlight({
  chartRef,
  seriesRef,
  containerRef,
  data,
  active,
  validation,
}: CandleHighlightOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectionRef = useRef<{ startX: number; endX: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  // mount canvas into container, same size
  useEffect(() => {
    if (!containerRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none'; // mouse events stay on StrategyOverlay
    canvas.style.zIndex = '15';
    containerRef.current.appendChild(canvas);
    canvasRef.current = canvas;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !canvasRef.current) return;
      canvasRef.current.width = containerRef.current.offsetWidth;
      canvasRef.current.height = containerRef.current.offsetHeight;
      paint();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      canvas.remove();
      canvasRef.current = null;
    };
  }, [containerRef]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || !data.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const timeScale = chart.timeScale();

    // ── Validation candidate: dim everything outside the match window ────────
    if (validation?.active && validation.candidate) {
      const { candles } = validation.candidate;
      if (candles.length) {
        const x1 = timeScale.timeToCoordinate(candles[0].time);
        const x2 = timeScale.timeToCoordinate(candles[candles.length - 1].time);

        // half a candle of padding
        let pad = 4;
        if (data.length >= 2) {
          const a = timeScale.timeToCoordinate(data[0].time);
          const b = timeScale.timeToCoordinate(data[1].time);
          if (a != null && b != null) pad = Math.max(2, Math.abs(b - a) * 0.4);
        }

        if (x1 != null && x2 != null) {
          const left  = Math.min(x1, x2) - pad;
          const right = Math.max(x1, x2) + pad;

          // dim everything outside
          ctx.fillStyle = "rgba(5,8,13,0.62)";
          ctx.fillRect(0, 0, left, canvas.height);
          ctx.fillRect(right, 0, canvas.width - right, canvas.height);

          // subtle accent tint over the window
          ctx.fillStyle = "rgba(143,170,220,0.1)";
          ctx.fillRect(left, 0, right - left, canvas.height);

          // border
          ctx.strokeStyle = "rgba(143,170,220,0.76)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(left,  0); ctx.lineTo(left,  canvas.height);
          ctx.moveTo(right, 0); ctx.lineTo(right, canvas.height);
          ctx.stroke();
        }
      }
      return; // skip annotation dim
    }
    // ────────────────────────────────────────────────────────────────────────

    if (!active) return;

    const selection = selectionRef.current;

    // dim overlay over entire chart first
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!selection) return;

    const selLeft = Math.min(selection.startX, selection.endX);
    const selRight = Math.max(selection.startX, selection.endX);

    // find candle width from first two candles
    let candleWidth = 8;
    if (data.length >= 2) {
      const x0 = timeScale.timeToCoordinate(data[0].time);
      const x1 = timeScale.timeToCoordinate(data[1].time);
      if (x0 != null && x1 != null) {
        candleWidth = Math.max(2, Math.abs(x1 - x0) * 0.8);
      }
    }

    // cut out selected candles — clear the dim over them
    data.forEach((candle) => {
      const x = timeScale.timeToCoordinate(candle.time);
      if (x == null) return;

      const inSelection = x >= selLeft - candleWidth / 2 && x <= selRight + candleWidth / 2;
      if (!inSelection) return;

      // clear dim over this candle so it shows through at full brightness
      ctx.clearRect(
        x - candleWidth / 2,
        0,
        candleWidth,
        canvas.height
      );
    });

    // selection border
    ctx.strokeStyle = '#2962ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(selLeft, 0, selRight - selLeft, canvas.height);

  }, [chartRef, seriesRef, data, active, validation]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const repaint = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(paint);
    };
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(repaint);

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(repaint);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [chartRef, paint]);

  // called by StrategyOverlay on drag
  const setSelection = useCallback((startX: number | null, endX: number | null) => {
    if (startX == null || endX == null) {
      selectionRef.current = null;
    } else {
      selectionRef.current = { startX, endX };
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paint);
  }, [paint]);

  const clearSelection = useCallback(() => {
    selectionRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paint);
  }, [paint]);

  // repaint when active toggles
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paint);
  }, [active, validation, paint]);

  return { canvasRef, setSelection, clearSelection };
}
