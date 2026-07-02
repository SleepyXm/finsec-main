'use client';

import { useEffect, useState } from "react";
import { theme, panelStyle,
  cornerStyle,
  buttonStyle,
  ghostButtonStyle, } from "@/app/components/UI/UI";

export function Banner() {
  const [consentGiven, setConsentGiven] = useState("");

  useEffect(() => {
    setConsentGiven("pending");
  }, []);

  if (consentGiven !== "pending") return null;

  const t = theme.dark;

  return (
    <div
      style={{
        position: "fixed",
        left: "1rem",
        right: "1rem",
        bottom: "1rem",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          ...panelStyle(t),
          padding: "1.35rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          pointerEvents: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
        }}
      >
        <div style={cornerStyle()} />

        <p
          style={{
            margin: 0,
            maxWidth: 720,
            color: t.muted,
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          We use tracking cookies to understand how you use the product and help
          us improve it. Please accept cookies to help us improve.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setConsentGiven("accepted")}
            style={buttonStyle(t)}
          >
            Accept cookies
          </button>

          <button
            type="button"
            onClick={() => setConsentGiven("declined")}
            style={ghostButtonStyle(t)}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}