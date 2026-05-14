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

        
      })}
    </div>
  );
}