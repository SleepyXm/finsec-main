"use client";

import { useRef } from "react";
import { PositionTag } from "./Positions/PositionOverlayTag";
import styles from "./Positions/PositionOverlay.module.css";
import { PositionTagsProps } from "./Positions/positionOverlayTypes";

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
        const id = position.trade_id;

        return (
          <PositionTag
            key={id}
            position={position}
            livePnL={livePnLMap[id] ?? 0}
            isLong={position.side === "long"}
            seriesRef={seriesRef}
            overlayRef={overlayRef}
            renderVersion={renderVersion}
            onClose={() => onClosePosition?.(id)}
            onUpdate={(patch) => updatePosition?.(id, patch)}
          />
        );
      })}
    </div>
  );
}
