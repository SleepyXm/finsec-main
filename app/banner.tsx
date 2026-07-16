'use client';

import { useEffect, useState } from "react";
import { theme, panelStyle, cornerStyle, buttonStyle, ghostButtonStyle, traderWhiteButtonStyle } from "@/app/ui";

export function Banner() {
  const [consentGiven, setConsentGiven] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [acceptHovered, setAcceptHovered] = useState(false);

  useEffect(() => {
    setConsentGiven("pending");
  }, []);

  const closeBanner = (value: "accepted" | "declined") => {
    setIsClosing(true);

    window.setTimeout(() => {
      setConsentGiven(value);
    }, 260);
  };

  if (consentGiven !== "pending") return null;

  const t = theme.dark;

  return (
    <>
      <style >{`
        .cookie-banner-copy-full {
          display: inline;
        }

        .cookie-banner-copy-short {
          display: none;
        }

        @media (max-width: 480px) {
          .cookie-banner-inner {
            padding: 0.85rem !important;
            gap: 0.75rem !important;
          }

          .cookie-banner-copy-full {
            display: none;
          }

          .cookie-banner-copy-short {
            display: inline;
          }

          .cookie-banner-actions {
            gap: 0.5rem !important;
          }
        }
      `}</style>

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
  className="cookie-banner-inner"
  style={{
    ...panelStyle(t),
    padding: "1rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    pointerEvents: isClosing ? "none" : "auto",
    boxShadow: "0 24px 80px rgba(0,0,0,0.28)",

    opacity: isClosing ? 0 : 1,
    filter: isClosing ? "blur(12px)" : "blur(0px)",
    WebkitFilter: isClosing ? "blur(12px)" : "blur(0px)",
    transition:
      "opacity 320ms ease, filter 320ms ease, -webkit-filter 320ms ease",
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
              flex: 1,
            }}
          >
            <span className="cookie-banner-copy-full">
              We use tracking cookies to understand how you use the product and
              help us improve it. Please accept cookies to help us improve.
            </span>

            <span className="cookie-banner-copy-short">
              We use cookies to improve the product.
            </span>
          </p>

          <div
            className="cookie-banner-actions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => closeBanner("accepted")}
              onMouseEnter={() => setAcceptHovered(true)}
              onMouseLeave={() => setAcceptHovered(false)}
              style={traderWhiteButtonStyle(acceptHovered, t)}
              /*className="auth-submit"*/
            >
              Accept
            </button>

            <button
              type="button"
              onClick={() => closeBanner("declined")}
              style={ghostButtonStyle(t)}
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
