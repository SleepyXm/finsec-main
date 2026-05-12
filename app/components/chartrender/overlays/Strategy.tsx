import { useRef, useState } from 'react';

const LABELS = [
  { value: 'fvg', label: 'Fair Value Gap' },
  { value: 'entry', label: 'Entry' },
  { value: 'exit', label: 'Exit' },
  { value: 'swing_high', label: 'Swing High' },
  { value: 'swing_low', label: 'Swing Low' },
  { value: 'resistance', label: 'Resistance' },
  { value: 'support', label: 'Support' },
  { value: 'accumulation', label: 'Accumulation' },
];

export function StrategyOverlay({ chartRef, seriesRef, data, onAnnotation }: {
  chartRef: React.MutableRefObject<any>;
  seriesRef: React.MutableRefObject<any>;
  data: any[];
  onAnnotation?: (annotation: any) => void;
}) {
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<any | null>(null);
  const [selectedCandles, setSelectedCandles] = useState<any[]>([]);
  const hasMoved = useRef(false);

  const getSelectedCandles = (rect: { x: number; y: number; w: number; h: number }) => {
    if (!chartRef.current || !data) return [];
    const timeStart = chartRef.current.timeScale().coordinateToTime(rect.x);
    const timeEnd = chartRef.current.timeScale().coordinateToTime(rect.x + rect.w);
    return data.filter((c: any) => c.time >= timeStart && c.time <= timeEnd);
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
    setDrawRect(newRect);
    setSelectedCandles(getSelectedCandles(newRect));
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

    setPendingAnnotation(dx < 8 && dy < 8
      ? { type: 'point', x, y, time: toTime(x), price: toPrice(y) }
      : {
          type: 'region',
          x: Math.min(drawStart.x, x), y: Math.min(drawStart.y, y),
          w: dx, h: dy,
          timeStart: toTime(Math.min(drawStart.x, x)),
          timeEnd: toTime(Math.max(drawStart.x, x)),
          priceHigh: toPrice(Math.min(drawStart.y, y)),
          priceLow: toPrice(Math.max(drawStart.y, y)),
          candles: selectedCandles,
        }
    );

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
      {drawRect ? (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: drawRect.y, background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 0, top: drawRect.y + drawRect.h, width: '100%', height: `calc(100% - ${drawRect.y + drawRect.h}px)`, background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 0, top: drawRect.y, width: drawRect.x, height: drawRect.h, background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: drawRect.x + drawRect.w, top: drawRect.y, right: 0, height: drawRect.h, background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: drawRect.x, top: drawRect.y, width: drawRect.w, height: drawRect.h, border: '1px solid #2962ff', background: 'rgba(41,98,255,0.05)', pointerEvents: 'none' }}>
            {selectedCandles.length > 0 && (() => {
              const high = Math.max(...selectedCandles.map((c: any) => c.high));
              const low = Math.min(...selectedCandles.map((c: any) => c.low));
              const open = selectedCandles[0].open;
              const close = selectedCandles[selectedCandles.length - 1].close;
              const change = (((close - open) / open) * 100).toFixed(2);
              const isUp = close >= open;
              return (
                <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(15,18,30,0.92)', border: '1px solid #2a2e3a', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontFamily: 'monospace', color: 'white', display: 'flex', gap: 12, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                  <span style={{ color: '#8a90a0' }}>{selectedCandles.length} candles</span>
                  <span style={{ color: '#22c55e' }}>H: {high.toFixed(2)}</span>
                  <span style={{ color: '#ef4444' }}>L: {low.toFixed(2)}</span>
                  <span style={{ color: '#8a90a0' }}>Range: {(high - low).toFixed(2)}</span>
                  <span style={{ color: isUp ? '#22c55e' : '#ef4444' }}>{isUp ? '+' : ''}{change}%</span>
                </div>
              );
            })()}
          </div>
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
      )}

      {pendingAnnotation && (
        <div style={{ position: 'absolute', left: pendingAnnotation.x + 8, top: pendingAnnotation.y + 8, background: '#1a1f2e', border: '1px solid #2a2e3a', borderRadius: 6, padding: '8px', zIndex: 30, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
          <select
            style={{ background: '#1a1f2e', color: 'white', border: '1px solid #2a2e3a', borderRadius: 4, padding: '4px' }}
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
          <button onClick={() => setPendingAnnotation(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 11, textAlign: 'left' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}