import { request } from "./auth";
import type { SubscriptionLimits, SubscriptionOverview, SubscriptionTier } from "../types/subscriptions";

export interface ProductProps {
  product_id: string;
  stripe_price_id: string;
  product_name: string;
  description: string;
  tier: SubscriptionTier;
  amount: number;
  price: number;
  currency: string;
  billing_interval: string;
  interval_count: number;
  limits: SubscriptionLimits;
}

export function getSubscriptionOverview(): Promise<SubscriptionOverview> {
  return request<SubscriptionOverview>("/api/products/subscription", { method: "GET" });
}

export async function getProducts(): Promise<ProductProps[]> {
  const res = await request<{ products?: ProductProps[] }>("/api/products/subscriptions", { method: "GET" });
  return res.products ?? [];
}

export async function createBillingPortalSession(): Promise<{ url: string }> {
  return request<{ url: string }>("/api/products/billing-portal", { method: "POST" });
}

export async function createCheckoutSession(priceId: string): Promise<{ url: string; session_id: string }> {
  return request<{ url: string; session_id: string }>("/api/products/checkout-session", {
    method: "POST",
    body: JSON.stringify({ price_id: priceId }),
  });
}

export async function checkoutSuccess(sessionId: string): Promise<void> {
  await request<void>(`/api/products/checkout-success?session_id=${sessionId}`, {
    method: "GET",
  });
}
