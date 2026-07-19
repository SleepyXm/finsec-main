"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBillingPortalSession, getSubscriptionOverview } from "@/app/handlers/products";
import type { SubscriptionLimits, SubscriptionOverview, SubscriptionUsage } from "@/app/types/subscriptions";
import { displaySubscriptionTier } from "@/app/types/subscriptions";
import { EmptyState, LoadingState } from "@/app/ui";
import { InfoRow, TabSection } from "./profilecomponents";

const RESOURCES: Array<{
  key: keyof SubscriptionLimits & keyof SubscriptionUsage;
  label: string;
}> = [
  { key: "saved_strategies", label: "Saved strategies" },
  { key: "saved_indicators", label: "Saved indicators" },
  { key: "active_backtests", label: "Active backtests" },
];

export function SubscriptionSection() {
  const [subscription, setSubscription] = useState<SubscriptionOverview | null>(null);
  const [error, setError] = useState("");
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    let active = true;
    getSubscriptionOverview()
      .then((value) => { if (active) setSubscription(value); })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load subscription");
      });
    return () => { active = false; };
  }, []);

  const openBilling = async () => {
    setError("");
    setOpeningPortal(true);
    try {
      const { url } = await createBillingPortalSession();
      window.location.assign(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open billing management");
      setOpeningPortal(false);
    }
  };

  if (error && !subscription) {
    return (
      <TabSection title="Subscription" subtitle="Your plan and current usage.">
        <EmptyState
          icon={<span aria-hidden="true" className="text-xl">!</span>}
          message={error}
          className="min-h-48 rounded-lg border-2 border-dashed border-red-400/20 text-red-300/70"
        />
      </TabSection>
    );
  }
  if (!subscription) {
    return (
      <TabSection title="Subscription" subtitle="Your plan and current usage.">
        <LoadingState message="Loading subscription…" className="rounded-lg border border-white/10" />
      </TabSection>
    );
  }

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;

  return (
    <TabSection title="Subscription" subtitle="Your plan and current usage.">
      <InfoRow label="Current plan" value={displaySubscriptionTier(subscription.tier)} />
      <InfoRow
        label="Billing status"
        value={subscription.cancel_at_period_end ? "Cancels at period end" : subscription.status}
      />
      {periodEnd && <InfoRow label="Current period ends" value={periodEnd} />}

      <div className="grid gap-3 pt-2 md:grid-cols-3">
        {RESOURCES.map(({ key, label }) => (
          <UsageCard
            key={key}
            label={label}
            used={subscription.usage[key]}
            limit={subscription.limits[key]}
          />
        ))}
      </div>

      {error && <p className="m-0 text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-3 pt-2">
        {subscription.can_manage_billing ? (
          <button
            type="button"
            disabled={openingPortal}
            onClick={() => void openBilling()}
            className="rounded-md border border-white/25 px-4 py-2 text-sm text-zinc-200 transition hover:border-white/60 hover:bg-white/10 disabled:opacity-50"
          >
            {openingPortal ? "Opening…" : "Manage billing"}
          </button>
        ) : (
          <Link
            href="/products"
            className="rounded-md border border-white/25 px-4 py-2 text-sm text-zinc-200 transition hover:border-white/60 hover:bg-white/10"
          >
            {subscription.tier === "free" ? "Upgrade plan" : "Compare plans"}
          </Link>
        )}
      </div>
    </TabSection>
  );
}

function UsageCard({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const percentage = limit === null || limit === 0 ? 0 : Math.min(100, (used / limit) * 100);
  return (
    <div className="rounded-lg border border-white/15 bg-white/[0.025] p-3">
      <p className="m-0 text-xs text-zinc-500">{label}</p>
      <p className="mb-2 mt-1 text-sm text-zinc-200">
        {used} / {limit === null ? "Unlimited" : limit}
      </p>
      {limit !== null && (
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-[#8FAADC]" style={{ width: `${percentage}%` }} />
        </div>
      )}
    </div>
  );
}
