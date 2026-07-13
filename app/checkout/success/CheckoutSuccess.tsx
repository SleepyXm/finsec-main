"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { checkoutSuccess } from "@/app/handlers/products";
import { validateUser } from "@/app/handlers/auth";
import { useUser } from "@/app/provider/userprovider";
import {
  Surface,
  traderWhiteButtonClassName,
} from "@/app/ui";

type ConfirmationStatus = "confirming" | "success" | "error";

type CheckoutSuccessProps = {
  sessionId: string | null;
};

// Prevent React development checks from confirming the same session twice.
const confirmations = new Map<string, Promise<void>>();

function confirmCheckoutOnce(sessionId: string) {
  const existing = confirmations.get(sessionId);
  if (existing) return existing;

  const confirmation = checkoutSuccess(sessionId);
  confirmations.set(sessionId, confirmation);

  return confirmation;
}

export default function CheckoutSuccess({
  sessionId,
}: CheckoutSuccessProps) {
  const { setUser, setAccount } = useUser();
  const [status, setStatus] = useState<ConfirmationStatus>(
    sessionId ? "confirming" : "error",
  );
  const [message, setMessage] = useState(
    sessionId
      ? "Confirming your subscription with Stripe."
      : "The checkout session reference is missing.",
  );

  useEffect(() => {
    if (!sessionId) return;

    let active = true;

    const confirmSubscription = async () => {
      try {
        await confirmCheckoutOnce(sessionId);

        // Force authentication data to be fetched instead of using the
        // five-minute local cache containing the previous subscription tier.
        localStorage.removeItem("user_validated_at");

        const result = await validateUser();

        if (!active) return;

        setUser(result?.user ?? null);
        setAccount(result?.account ?? null);
        setStatus("success");
        setMessage("Your subscription is active and your account has been updated.");
      } catch (error) {
        if (!active) return;

        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "We could not confirm your subscription.",
        );
      }
    };

    void confirmSubscription();

    return () => {
      active = false;
    };
  }, [sessionId, setAccount, setUser]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_15%_10%,rgba(143,170,220,0.10),transparent_28%),linear-gradient(180deg,#0E1117_0%,#131821_45%,#0E1117_100%)] px-6 py-28 text-[#EEF2F7]">
      <Surface as="section" variant="trader" decorated cornerOpacity={0.42} className="w-full max-w-xl p-8 md:p-12">

        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8FAADC]">
          Checkout
        </p>

        <h1 className="mt-4 text-3xl font-semibold text-[#EEF2F7] md:text-4xl">
          {status === "confirming" && "Confirming payment"}
          {status === "success" && "Subscription confirmed"}
          {status === "error" && "Confirmation problem"}
        </h1>

        <p className="mt-4 text-sm leading-6 text-white/55">
          {message}
        </p>

        {status === "confirming" && (
          <div
            className="mt-8 h-px w-full overflow-hidden bg-white/10"
            aria-label="Confirming subscription"
          >
            <div className="h-full w-1/2 animate-pulse bg-[#8FAADC]" />
          </div>
        )}

        {status === "success" && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className={`${traderWhiteButtonClassName} text-center`}
            >
              Open dashboard
            </Link>

            <Link
              href="/profile"
              className="w-full border border-white/15 px-4 py-3 text-center text-sm text-white/70 transition hover:border-white/30 hover:text-white"
            >
              View account
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/products"
              className={`${traderWhiteButtonClassName} text-center`}
            >
              Return to plans
            </Link>

            <Link
              href="/profile"
              className="w-full border border-white/15 px-4 py-3 text-center text-sm text-white/70 transition hover:border-white/30 hover:text-white"
            >
              Check account
            </Link>
          </div>
        )}
      </Surface>
    </main>
  );
}
