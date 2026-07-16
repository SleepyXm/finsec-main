import React from "react";

export const handleGridGlowMove = (event: React.MouseEvent<HTMLElement>) => {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--grid-x", `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty("--grid-y", `${event.clientY - rect.top}px`);
};
