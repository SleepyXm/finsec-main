export type SubscriptionTier = "free" | "premium" | "professional" | "enterprise";

export type SubscriptionLimits = {
  saved_strategies: number | null;
  saved_indicators: number | null;
  active_backtests: number | null;
};

export type SubscriptionUsage = {
  saved_strategies: number;
  saved_indicators: number;
  active_backtests: number;
};

export type SubscriptionOverview = {
  tier: SubscriptionTier;
  status: string;
  limits: SubscriptionLimits;
  usage: SubscriptionUsage;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  can_manage_billing: boolean;
};

export type SubscriptionLimitDetail = {
  code: "subscription_limit_reached";
  detail: string;
  resource: keyof SubscriptionLimits;
  tier: SubscriptionTier;
  limit: number;
  usage: number;
  upgrade_url: string;
};

export const SUBSCRIPTION_LIMIT_EVENT = "finsec:subscription-limit";

export function normalizeSubscriptionTier(value: string | null | undefined): SubscriptionTier {
  switch (value?.trim().toLowerCase()) {
    case "premium":
      return "premium";
    case "professional":
      return "professional";
    case "enterprise":
      return "enterprise";
    default:
      return "free";
  }
}

export function displaySubscriptionTier(tier: SubscriptionTier) {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
