import { useRef, useState } from 'react';
import { AnnotationDraft } from '@/app/components/handlers/annotations';
import { Candle } from '@/app/components/types/charts';
import { useChartContext } from "@/app/(pages)/chart/chartcontext";
import { cornerStyle, MonoLabel, theme, traderInsetPanelStyle, TraderBlankButton } from "@/app/UI";

const LABELS = [
  {value: 'bearish_fvg', label: "Bearish Fair Value Gap"},
  {value: 'bullish_fvg', label: "Bullish Fair Value Gap"},
  {value: 'failed_bullish_fvg', label: "Failed Bullish Fair Value Gap"},
  {value: 'failed_bearish_fvg', label: "Failed Bearish Fair Value Gap"},
  { value: 'head_and_shoulders', label: 'Head & Shoulders' },
  { value: 'entry', label: 'Entry' },
  { value: 'exit', label: 'Exit' },
  { value: 'swing_high', label: 'Swing High' },
  { value: 'swing_low', label: 'Swing Low' },
  { value: 'resistance', label: 'Resistance' },
  { value: 'support', label: 'Support' },
  { value: 'accumulation', label: 'Accumulation' },
];

type PendingAnnotation = Omit<AnnotationDraft, 'label'> & {
  x: number;
  y: number;
  w: number;
  h: number;
  priceHigh: number;
  priceLow: number;
};

export function StrategyOverlay({ chartRef, seriesRef, data, onAnnotation, setSelection, clearSelection }: {
  chartRef: React.MutableRefObject<any>;
  seriesRef: React.MutableRefObject<any>;
  data: Candle[];
  onAnnotation?: (annotation: AnnotationDraft) => void;
  setSelection: (startX: number, endX: number) => void;
  clearSelection: () => void;
}) {
  const { annotationStrategyLabel } = useChartContext();
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [selectedCandles, setSelectedCandles] = useState<Candle[]>([]);
  const hasMoved = useRef(false);
  const snapToCandle = (x: number): number => {
    if (!chartRef.current || !data.length) return x;
    const timeScale = chartRef.current.timeScale();
    let closest = x;
    let minDist = Infinity;
    data.forEach((candle) => {
        const cx = timeScale.timeToCoordinate(candle.time);
        if (cx == null) return;
        const dist = Math.abs(cx - x);
        if (dist < minDist) {
        minDist = dist;
        closest = cx;
        }
    });
    return closest;
};



  const getSelectedCandles = (rect: { x: number; y: number; w: number; h: number }) => {
    if (!chartRef.current || !data) return [];
    const timeStart = chartRef.current.timeScale().coordinateToTime(rect.x);
    const timeEnd = chartRef.current.timeScale().coordinateToTime(rect.x + rect.w);
    return data.filter((candle) => candle.time >= Number(timeStart) && candle.time <= Number(timeEnd));
  };

  const handleDrawStart = (e: React.MouseEvent) => {
    hasMoved.current = false;
    const rect = e.currentTarget.getBoundingClientRect();
    setDrawStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDrawRect(null);
  };

  const handleDrawMove = (e: React.MouseEvent) => {
    if (!drawStart) return;
    hasMoved.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newRect = {
      x: Math.min(drawStart.x, x),
      y: Math.min(drawStart.y, y),
      w: Math.abs(x - drawStart.x),
      h: Math.abs(y - drawStart.y),
    };
    const snappedX = snapToCandle(x);
    setDrawRect(newRect);
    setSelectedCandles(getSelectedCandles(newRect));
    setSelection(snapToCandle(drawStart.x), snappedX);
  };

  const handleDrawEnd = (e: React.MouseEvent) => {
    if (!drawStart || !hasMoved.current) {
      setDrawStart(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = Math.abs(x - drawStart.x);
    const dy = Math.abs(y - drawStart.y);
    const toPrice = (py: number) => seriesRef.current?.coordinateToPrice(py);
    const toTime = (px: number) => chartRef.current?.timeScale().coordinateToTime(px);

    if (dx >= 8 || dy >= 8) {
      const annotation: PendingAnnotation = {
        x: Math.min(drawStart.x, x), y: Math.min(drawStart.y, y),
        w: dx, h: dy,
        timeStart: Number(toTime(Math.min(drawStart.x, x))),
        timeEnd: Number(toTime(Math.max(drawStart.x, x))),
        priceHigh: Number(toPrice(Math.min(drawStart.y, y))),
        priceLow: Number(toPrice(Math.max(drawStart.y, y))),
        candles: selectedCandles,
      };
      if (annotationStrategyLabel) {
        onAnnotation?.({ ...annotation, label: annotationStrategyLabel });
      } else {
        setPendingAnnotation(annotation);
      }
    }

    clearSelection();
    setDrawStart(null);
    setDrawRect(null);
  };

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 20, cursor: 'crosshair' }}
      onMouseDown={handleDrawStart}
      onMouseMove={handleDrawMove}
      onMouseUp={handleDrawEnd}
    >
      {selectedCandles.length > 0 && drawRect && (() => {
        const high = Math.max(...selectedCandles.map((candle) => candle.high));
        const low = Math.min(...selectedCandles.map((candle) => candle.low));
        const open = selectedCandles[0].open;
        const close = selectedCandles[selectedCandles.length - 1].close;
        const change = (((close - open) / open) * 100).toFixed(2);
        const isUp = close >= open;
        return (
          <div style={{
            ...traderInsetPanelStyle(theme.dark),
            position: 'absolute', top: 8, left: 8, padding: '6px 9px',
            fontSize: 9, fontFamily: 'var(--font-code), monospace', color: theme.dark.text,
            display: 'flex', gap: 10, pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            <div style={cornerStyle()} />
            <span style={{ color: theme.dark.accent }}>{selectedCandles.length} candles</span>
            <span style={{ color: theme.dark.muted }}>H {high.toFixed(2)}</span>
            <span style={{ color: theme.dark.muted }}>L {low.toFixed(2)}</span>
            <span style={{ color: theme.dark.muted2 }}>Range {(high - low).toFixed(2)}</span>
            <span style={{ color: isUp ? theme.dark.successText : theme.dark.errorText }}>{isUp ? '+' : ''}{change}%</span>
          </div>
        );
      })()}

      {pendingAnnotation && (
        <div style={{
          ...traderInsetPanelStyle(theme.dark),
          position: 'absolute', left: pendingAnnotation.x + 8, top: pendingAnnotation.y + 8,
          padding: 9, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 190,
        }}>
          <div style={cornerStyle()} />
          <MonoLabel>Strategy label</MonoLabel>
          <select
            style={{
              width: '100%', background: theme.dark.bg2, color: theme.dark.text,
              border: `1px solid ${theme.dark.borderSoft}`, padding: '7px 8px',
              fontSize: 10, fontFamily: 'inherit', outline: 'none',
            }}
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              onAnnotation?.({ ...pendingAnnotation, label: e.target.value });
              setPendingAnnotation(null);
            }}
          >
            <option value="" disabled>Select label...</option>
            {LABELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <TraderBlankButton onClick={() => setPendingAnnotation(null)} style={{ padding: '6px 8px', fontSize: 9 }}>
            Cancel
          </TraderBlankButton>
        </div>
      )}
    </div>
  );
}
