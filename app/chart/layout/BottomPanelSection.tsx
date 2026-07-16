"use client";

import React from "react";
import { theme, cornerStyle } from "@/app/ui";

const selectedBlurBg     = "rgba(238,242,247,0.085)";
const selectedBlurBorder = "rgba(238,242,247,0.26)";
const idleBg             = "rgba(238,242,247,0.025)";

interface BottomPanelSectionProps {
  bottomH:          number;
  bottomOpen:       boolean;
  draggingBottom:   React.MutableRefObject<boolean>;
  onBottomDragStart:(e: React.MouseEvent) => void;
  bottomPanel?:     React.ReactNode;
}

export function BottomPanelSection({
  bottomH, bottomOpen, draggingBottom, onBottomDragStart, bottomPanel,
}: BottomPanelSectionProps) {
  return (
    <div style={{
      height: bottomH, minHeight: bottomH,
      borderTop: `1px solid ${theme.dark.borderSoft}`,
      background: "rgba(14,17,23,0.92)",
      display: "flex", flexDirection: "column",
      zIndex: 40,
      transition: draggingBottom.current ? "none" : "height 120ms ease",
    }}>
      {/* drag handle */}
      <div
        onMouseDown={onBottomDragStart}
        style={{ height: 4, cursor: "ns-resize", background: "transparent", flexShrink: 0, position: "relative" }}
      >
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 32, height: 3, borderRadius: 0,
          background: selectedBlurBg,
          border: `1px solid ${selectedBlurBorder}`,
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        }} />
      </div>

      {bottomOpen && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            padding: "8px 12px",
          }}
        >
          {bottomPanel ?? (
            <div style={{
              position: "relative", padding: 14,
              color: theme.dark.muted2, fontSize: 12,
              border: `1px solid ${theme.dark.borderSoft}`,
              background: idleBg,
            }}>
              <div style={cornerStyle()} />
              Panel content goes here
            </div>
          )}
        </div>
      )}
    </div>
  );
}
