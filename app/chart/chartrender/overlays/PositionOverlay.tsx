"use client";

import { useRef } from "react";
import type { MutableRefObject } from "react";
import { PositionTag } from "./Positions/PositionOverlayTag";
import styles from "./Positions/PositionOverlay.module.css";
import type { PositionTagsProps, PositionWithExtras } from "./Positions/positionOverlayTypes";

function getTag(position: PositionWithExtras, livePnLMap: Record<string, number>, seriesRef: MutableRefObject<any>) {
  const id = position.trade_id;
  const livePnL = livePnLMap[id] ?? 0;
  const isLong = position.side === "long";
  const y = seriesRef.current?.priceToCoordinate(position.entry_price);

  return { id, position, livePnL, isLong, y };
}

export function PositionTags({
  positions,
  livePnLMap,
  seriesRef,
  renderVersion,
  onClosePosition,
  updatePosition,
}: PositionTagsProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  return (
    <div ref={overlayRef} className={styles.overlay} data-render-version={renderVersion}>
      {positions.map((position) => {
        const tag = getTag(position, livePnLMap, seriesRef);

        if (tag.y == null || isNaN(tag.y)) return null;

        return (
          <PositionTag
            key={tag.id}
            position={tag.position}
            livePnL={tag.livePnL}
            isLong={tag.isLong}
            y={tag.y}
            seriesRef={seriesRef}
            overlayRef={overlayRef}
            onClose={() => onClosePosition?.(tag.id)}
            onUpdate={(patch) => updatePosition?.(tag.id, patch)}
          />
        );
      })}
    </div>
  );
}
