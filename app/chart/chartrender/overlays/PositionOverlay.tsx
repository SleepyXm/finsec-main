export function PositionTags({ positions, livePnLMap, seriesRef, onClosePosition }: {
  positions: any[];
  livePnLMap: Record<string, number>;
  seriesRef: React.MutableRefObject<any>;
  onClosePosition?: (id: string) => void;
}) {
  const tags = positions.map((position) => {
    const id = position.position_id ?? position.id;
    const livePnL = livePnLMap[id] ?? 0;
    const isLong = position.side === 'long';
    const y = seriesRef.current?.priceToCoordinate(position.entry_price);
    return { id, position, livePnL, isLong, y };
  });

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      {tags.map(({ id, position, livePnL, isLong, y }) => {
        if (y == null || isNaN(y)) return null;
        const lineColor = isLong ? '#22c55e' : '#ef4444';
        const tagBg = isLong ? '#044720' : '#450a0a';
        const pnlColor = livePnL >= 0 ? '#4ade80' : '#f87171';

        return (
          <div key={id} style={{ position: 'absolute', right: 60, top: y - 16, pointerEvents: 'auto', display: 'flex', alignItems: 'center', background: tagBg, border: `1px solid ${lineColor}`, borderLeft: `3px solid ${lineColor}`, borderRadius: 3, padding: '2px 6px', gap: 8, minWidth: 130 }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: lineColor, fontWeight: 600 }}>
                {position.side.toUpperCase()} {position.symbol}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: pnlColor }}>
                {livePnL >= 0 ? '+' : ''}${livePnL.toFixed(2)}
              </span>
            </div>
            {onClosePosition && (
              <button onClick={() => onClosePosition(id)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
              >✕</button>
            )}
          </div>
        );
      })}
    </div>
  );
}