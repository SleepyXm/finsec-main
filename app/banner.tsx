"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { CookieConsent, getPreferences, saveCookieConsent } from "@/app/components/handlers/profile";
import { useUser } from "@/app/components/provider/userprovider";
import type { SubscriptionLimitDetail } from "@/app/components/types/subscriptions";
import { SUBSCRIPTION_LIMIT_EVENT } from "@/app/components/types/subscriptions";
import { cornerStyle, ghostButtonStyle, panelStyle, theme, traderWhiteButtonStyle } from "@/app/UI";

const SESSION_CONSENT_KEY = "finsec.cookie-consent";

export function Banner() {
  const { user, resolved } = useUser();
  const [consent, setConsent] = useState<"loading" | "pending" | "hidden">("loading");
  const [consentError, setConsentError] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [acceptHovered, setAcceptHovered] = useState(false);
  const [limitNotice, setLimitNotice] = useState<SubscriptionLimitDetail | null>(null);

  useEffect(() => {
    if (!resolved) return;
    let active = true;

    async function resolveConsent() {
      if (!user) {
        const saved = sessionStorage.getItem(SESSION_CONSENT_KEY);
        if (active) setConsent(saved === "accepted" || saved === "declined" ? "hidden" : "pending");
        return;
      }
      const preferences = await getPreferences();
      if (active) setConsent(preferences?.cookie_consent ? "hidden" : "pending");
    }

    void resolveConsent();
    return () => { active = false; };
  }, [resolved, user]);

  useEffect(() => {
    const showLimit = (event: Event) => {
      setLimitNotice((event as CustomEvent<SubscriptionLimitDetail>).detail);
    };
    window.addEventListener(SUBSCRIPTION_LIMIT_EVENT, showLimit);
    return () => window.removeEventListener(SUBSCRIPTION_LIMIT_EVENT, showLimit);
  }, []);

  const storeConsent = async (value: CookieConsent) => {
    setConsentError("");
    try {
      if (user) {
        await saveCookieConsent(value);
      } else {
        sessionStorage.setItem(SESSION_CONSENT_KEY, value);
      }
      setIsClosing(true);
      window.setTimeout(() => {
        setConsent("hidden");
        setIsClosing(false);
      }, 260);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : "Could not save your preference");
    }
  };

  if (consent !== "pending" && !limitNotice) return null;
  const t = theme.dark;

  return (
    <>
      <style>{`
        .banner-copy-short { display: none; }
        @media (max-width: 480px) {
          .banner-inner { padding: 0.85rem !important; gap: 0.75rem !important; }
          .banner-copy-full { display: none; }
          .banner-copy-short { display: inline; }
          .banner-actions { gap: 0.5rem !important; }
        }
      `}</style>
      <div className="fixed bottom-4 left-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
        {limitNotice && (
          <BannerPanel>
            <p className="m-0 flex-1 text-sm leading-6 text-white/65">
              {limitNotice.detail}
            </p>
            <div className="banner-actions flex shrink-0 items-center gap-3">
              <Link href={limitNotice.upgrade_url || "/products"} style={traderWhiteButtonStyle(false, t)}>
                Compare plans
              </Link>
              <button type="button" onClick={() => setLimitNotice(null)} style={ghostButtonStyle(t)}>
                Dismiss
              </button>
            </div>
          </BannerPanel>
        )}

        {consent === "pending" && (
          <BannerPanel isClosing={isClosing}>
            <div className="flex flex-1 flex-col gap-1">
              <p className="m-0 max-w-[720px] text-sm leading-6 text-white/55">
                <span className="banner-copy-full">
                  We use tracking cookies to understand how you use the product and help us improve it.
                </span>
                <span className="banner-copy-short">We use cookies to improve the product.</span>
              </p>
              {consentError && <p className="m-0 text-xs text-[#E2A1A1]">{consentError}</p>}
            </div>
            <div className="banner-actions flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => void storeConsent("accepted")}
                onMouseEnter={() => setAcceptHovered(true)}
                onMouseLeave={() => setAcceptHovered(false)}
                style={traderWhiteButtonStyle(acceptHovered, t)}
              >
                Accept
              </button>
              <button type="button" onClick={() => void storeConsent("declined")} style={ghostButtonStyle(t)}>
                Decline
              </button>
            </div>
          </BannerPanel>
        )}
      </div>
    </>
  );
}

function BannerPanel({ children, isClosing = false }: { children: ReactNode; isClosing?: boolean }) {
  const t = theme.dark;
  return (
    <div
      className="banner-inner flex items-center justify-between gap-4 p-4 pointer-events-auto"
      style={{
        ...panelStyle(t),
        boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
        opacity: isClosing ? 0 : 1,
        filter: isClosing ? "blur(12px)" : "blur(0px)",
        pointerEvents: isClosing ? "none" : "auto",
        transition: "opacity 320ms ease, filter 320ms ease",
      }}
    >
      <div style={cornerStyle()} />
      {children}
    </div>
  );
}
