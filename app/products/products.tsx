"use client";

import { useEffect, useState } from "react";
import {
  createCheckoutSession,
  getProducts,
  type ProductProps,
} from "../handlers/products";
import {
  traderCornerStyle,
  traderInactiveButtonClassName,
  traderWhiteButtonClassName,
} from "../components/UI/UI";
import { useUser } from "../provider/userprovider";

const Products = () => {
  const { user, resolved } = useUser();
  const [products, setProducts] = useState<ProductProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutProduct, setCheckoutProduct] = useState<string | null>(null);
  const currentTier = normalizeTier(user?.subscription_tier);

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

  const handleCheckout = async (product: ProductProps) => {
    const requestedTier = normalizeTier(product.tier);
    if (product.amount <= 0 || requestedTier === currentTier) return;

    if (!user) {
      setError("Sign in before choosing a subscription.");
      return;
    }

    setError("");
    setCheckoutProduct(product.product_id);

    try {
      const { url } = await createCheckoutSession(product.stripe_price_id);
      window.location.href = url;
    } catch (err) {
      setCheckoutProduct(null);
      setError(err instanceof Error ? err.message : "Could not start checkout");
    }
  };

  return (
    <section className="relative z-10 flex w-full flex-col gap-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8FAADC]">
          Subscriptions
        </p>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.02] text-[#EEF2F7] md:text-6xl">
            Choose the market access that fits your workflow.
          </h1>
          <p className="max-w-sm text-sm leading-6 text-white/55">
            Focused plans for live data, backtests, and execution workflows.
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
              className="relative min-h-[310px] border border-white/[0.08] bg-white/[0.025] p-7"
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
            const isFree = product.amount <= 0;
            const isCurrentPlan = normalizeTier(product.tier) === currentTier;
            const isCheckingOut = checkoutProduct === product.product_id;
            const disabled = !resolved || isFree || isCurrentPlan || isCheckingOut;

            return (
              <article
                key={product.product_id}
                className="group relative flex min-h-[310px] flex-col justify-between overflow-visible border border-white/[0.09] bg-[linear-gradient(180deg,rgba(238,242,247,0.045),rgba(238,242,247,0.018))] p-7 shadow-[inset_0_1px_0_rgba(238,242,247,0.04)] transition duration-200 hover:-translate-y-1 hover:border-white/[0.2] hover:bg-white/[0.055]"
              >
                <span aria-hidden="true" style={traderCornerStyle(0.42)} />

                <div className="flex flex-col gap-7">
                  <div className="flex items-center justify-between gap-3">
                    <span className="border border-[#8FAADC]/25 bg-[#8FAADC]/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[#BFD0EF]">
                      {product.tier}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/35">
                      {product.billing_interval}
                    </span>
                  </div>

                  <div className="flex flex-col gap-3">
                    <h2 className="text-2xl font-semibold leading-tight text-[#EEF2F7]">
                      {product.product_name}
                    </h2>
                    <p className="min-h-12 text-sm leading-6 text-white/55">
                      {product.description || productDescription(product.tier)}
                    </p>
                  </div>

                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-semibold text-[#EEF2F7]">
                      {formatPrice(product)}
                    </span>
                    {!isFree && (
                      <span className="pb-1 text-sm text-white/45">
                        / {formatInterval(product)}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={disabled}
                  className={`mt-8 ${disabled ? traderInactiveButtonClassName : traderWhiteButtonClassName}`}
                  onClick={() => handleCheckout(product)}
                >
                  {buttonLabel({ isCurrentPlan, isFree, isCheckingOut })}
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

function productDescription(tier: string) {
  const descriptions: Record<string, string> = {
    free: "Core access for trying the platform and keeping a baseline account.",
    premium: "Live market tools and daily trading workflows for active users.",
    professional: "Expanded research, execution support, and higher-intensity strategy work.",
    enterprise: "Full workspace access for advanced operations and team-level usage.",
  };

  return descriptions[tier] ?? "Subscription access for your Finsec workspace.";
}

function normalizeTier(tier: string | null | undefined) {
  const normalized = tier?.trim().toLowerCase();
  return !normalized || normalized === "none" ? "free" : normalized;
}

function buttonLabel({
  isCurrentPlan,
  isFree,
  isCheckingOut,
}: {
  isCurrentPlan: boolean;
  isFree: boolean;
  isCheckingOut: boolean;
}) {
  if (isCurrentPlan) return "Current plan";
  if (isFree) return "Included";
  if (isCheckingOut) return "Opening...";
  return "Checkout";
}

export default Products;
