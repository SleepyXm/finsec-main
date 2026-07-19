"use client";

import { useEffect, useState } from "react";
import { createBillingPortalSession, createCheckoutSession, getProducts, getSubscriptionOverview, ProductProps } from "../handlers/products";
import { traderCornerStyle, traderInactiveButtonClassName, traderWhiteButtonClassName } from "@/app/ui";
import { useUser } from "../provider/userprovider";
import type { SubscriptionLimits, SubscriptionOverview } from "../types/subscriptions";
import { normalizeSubscriptionTier } from "../types/subscriptions";

type PlanPresentation = {
  description: string;
  features: string[];
  recommended?: boolean;
};

const PLAN_PRESENTATION: Record<string, PlanPresentation> = {
  free: {
    description: "Build and test strategy logic before putting it into live monitoring.",
    features: [
      "Backtest against historical data",
      "Strategy output stays in backtesting",
      "No live watch bots",
    ],
  },
  premium: {
    description: "Run proven strategies through watch bots without maintaining your own VPS.",
    recommended: true,
    features: [
      "Apply strategies to watch bots",
      "Live strategy alerts",
      "Server-side monitoring — no VPS required",
    ],
  },
  professional: {
    description: "Monitor more strategies and market conditions at the same time.",
    features: [
      "Apply strategies to watch bots",
      "Live strategy alerts",
      "Expanded watch-bot capacity",
    ],
  },
  enterprise: {
    description: "The highest strategy and monitoring capacity available on Finsec.",
    features: [
      "Apply strategies to watch bots",
      "Live strategy alerts",
      "Highest watch-bot capacity",
    ],
  },
};

const Products = () => {
  const { user, resolved } = useUser();
  const [products, setProducts] = useState<ProductProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutProduct, setCheckoutProduct] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionOverview | null>(null);
  const currentTier = subscription?.tier ?? normalizeSubscriptionTier(user?.subscription_tier);
  const hasPaidPlan = currentTier !== "free";

  useEffect(() => {
    let isMounted = true;

    const fetchProducts = async () => {
      try {
        const data = await getProducts();
        if (isMounted) setProducts(data);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Could not load products");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!resolved || !user) return;
    let isMounted = true;
    getSubscriptionOverview()
      .then((value) => { if (isMounted) setSubscription(value); })
      .catch((reason) => {
        if (isMounted) setError(reason instanceof Error ? reason.message : "Could not load current subscription");
      });
    return () => { isMounted = false; };
  }, [resolved, user]);

  const handleCheckout = async (product: ProductProps) => {
    const requestedTier = normalizeSubscriptionTier(product.tier);
    if (product.amount <= 0 || requestedTier === currentTier) return;

    if (!user) {
      setError("Sign in before choosing a subscription.");
      return;
    }

    setError("");
    setCheckoutProduct(product.product_id);

    try {
      const { url } = hasPaidPlan
        ? await createBillingPortalSession()
        : await createCheckoutSession(product.stripe_price_id);
      window.location.href = url;
    } catch (err) {
      setCheckoutProduct(null);
      setError(err instanceof Error ? err.message : "Could not start checkout");
    }
  };

  return (
    <section className="relative z-10 flex w-full flex-col gap-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8FAADC]">
          Strategy monitoring
        </p>
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <h1 className="max-w-3xl text-4xl font-semibold leading-[0.98] text-[#EEF2F7] md:text-6xl">
            Build the strategy. Let Finsec watch it.
          </h1>
          <p className="max-w-md text-sm leading-6 text-white/55">
            Backtest your logic, assign proven strategies to watch bots, and get
            alerted without keeping a chart or VPS running.
          </p>
        </div>
      </div>

      {error && (
        <div className="mx-auto w-full max-w-6xl border border-[#C77D7D]/35 bg-[#C77D7D]/10 px-4 py-3 text-sm text-[#E2A1A1]">
          {error}
        </div>
      )}

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {loading &&
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="relative min-h-[570px] border border-white/[0.08] bg-white/[0.025] p-7"
            >
              <span aria-hidden="true" style={traderCornerStyle(0.32)} />
              <div className="h-4 w-20 bg-white/10" />
              <div className="mt-8 h-9 w-3/4 bg-white/10" />
              <div className="mt-4 h-3 w-full bg-white/[0.07]" />
              <div className="mt-2 h-3 w-2/3 bg-white/[0.07]" />
              <div className="absolute bottom-7 left-7 right-7 h-11 bg-white/10" />
            </div>
          ))}

        {!loading &&
          products.map((product) => {
            const tier = normalizeSubscriptionTier(product.tier);
            const presentation = planPresentation(tier);
            const isFree = product.amount <= 0;
            const isCurrentPlan = tier === currentTier;
            const isCheckingOut = checkoutProduct === product.product_id;
            const billingIsExternal = hasPaidPlan && !subscription?.can_manage_billing;
            const disabled = !resolved || isFree || isCurrentPlan || isCheckingOut || billingIsExternal;

            return (
              <article
                key={product.product_id}
                className={`group relative flex min-h-[570px] flex-col overflow-visible border bg-[linear-gradient(180deg,rgba(238,242,247,0.045),rgba(238,242,247,0.018))] p-7 shadow-[inset_0_1px_0_rgba(238,242,247,0.04)] transition duration-200 hover:-translate-y-1 hover:bg-white/[0.055] ${
                  presentation.recommended
                    ? "border-[#8FAADC]/45 hover:border-[#8FAADC]/70"
                    : "border-white/[0.09] hover:border-white/[0.2]"
                }`}
              >
                <span aria-hidden="true" style={traderCornerStyle(0.42)} />

                <div className="flex min-h-7 items-center justify-between gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#BFD0EF]">
                    {displayProductName(product)}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/30">
                    {product.billing_interval}
                  </span>
                </div>

                <div className="mt-7 min-h-[116px]">
                  <h2 className="text-2xl font-semibold leading-tight text-[#EEF2F7]">
                    {displayProductName(product)}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-white/55">
                    {presentation.description}
                  </p>
                </div>

                <div className="mt-6 flex min-h-14 items-end gap-2 border-b border-white/[0.08] pb-6">
                  <span className="text-4xl font-semibold tracking-[-0.03em] text-[#EEF2F7]">
                    {formatPrice(product)}
                  </span>
                  {!isFree && (
                    <span className="pb-1 text-sm text-white/45">
                      / {formatInterval(product)}
                    </span>
                  )}
                </div>

                <ul className="mt-6 flex flex-1 list-none flex-col gap-3 p-0">
                  {productFeatures(product.limits, presentation.features).map((feature) => (
                    <li
                      key={feature}
                      className="grid grid-cols-[12px_1fr] gap-2.5 text-[13px] leading-5 text-white/68"
                    >
                      <span aria-hidden="true" className="font-mono text-[#8FAADC]">
                        {feature.startsWith("No ") ? "—" : "+"}
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={disabled}
                  className={`mt-8 ${disabled ? traderInactiveButtonClassName : traderWhiteButtonClassName}`}
                  onClick={() => handleCheckout(product)}
                >
                  {buttonLabel({
                    isCurrentPlan,
                    isFree,
                    isCheckingOut,
                    hasPaidPlan,
                    billingIsExternal,
                    productName: displayProductName(product),
                  })}
                </button>
              </article>
            );
          })}

        {!loading && products.length === 0 && (
          <div className="relative col-span-full border border-white/[0.09] bg-white/[0.025] p-8 text-sm text-white/55">
            <span aria-hidden="true" style={traderCornerStyle(0.32)} />
            No active products are available yet.
          </div>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-3 border-y border-white/[0.08] py-5 text-sm text-white/50 md:grid-cols-[180px_1fr] md:items-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#8FAADC]">
          Live monitoring
        </span>
        <p className="leading-6">
          Paid plans run watch bots on Finsec infrastructure. Your browser and
          personal VPS do not need to stay online.
        </p>
      </div>
    </section>
  );
};

function formatPrice(product: ProductProps) {
  if (product.amount <= 0) return "Free";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (product.currency || "usd").toUpperCase(),
    maximumFractionDigits: Number.isInteger(product.price) ? 0 : 2,
  }).format(product.price);
}

function formatInterval(product: ProductProps) {
  if (product.interval_count > 1) {
    return `${product.interval_count} ${product.billing_interval}s`;
  }

  return product.billing_interval;
}

function planPresentation(tier: string): PlanPresentation {
  return PLAN_PRESENTATION[tier] ?? {
    description: "Strategy monitoring and platform access through Finsec.",
    features: [
      "Strategy editor access",
      "Historical backtesting",
      "Indicator access",
      "Watchlist access",
      "Account support",
    ],
  };
}

function displayProductName(product: ProductProps) {
  return product.product_name.replace(/\s*\((monthly|yearly)\)\s*$/i, "");
}

function productFeatures(limits: SubscriptionLimits, features: string[]) {
  return [
    formatCapacity(limits.saved_strategies, "saved strategies"),
    formatCapacity(limits.saved_indicators, "saved indicators"),
    formatCapacity(limits.active_backtests, "active backtests"),
    ...features,
  ];
}

function formatCapacity(limit: number | null, label: string) {
  return limit === null ? `Unlimited ${label}` : `${limit} ${label}`;
}

function buttonLabel({
  isCurrentPlan,
  isFree,
  isCheckingOut,
  hasPaidPlan,
  billingIsExternal,
  productName,
}: {
  isCurrentPlan: boolean;
  isFree: boolean;
  isCheckingOut: boolean;
  hasPaidPlan: boolean;
  billingIsExternal: boolean;
  productName: string;
}) {
  if (isCurrentPlan) return "Current plan";
  if (isFree) return "Included";
  if (isCheckingOut) return "Opening...";
  if (billingIsExternal) return "Billing managed externally";
  if (hasPaidPlan) return "Manage in billing";
  return `Choose ${productName}`;
}

export default Products;
