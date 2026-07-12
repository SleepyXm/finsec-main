import { request } from "./auth";

export interface ProductProps {
  product_id: string;
  stripe_price_id: string;
  product_name: string;
  description: string;
  tier: string;
  amount: number;
  price: number;
  currency: string;
  billing_interval: string;
  interval_count: number;
}

export async function getProducts(): Promise<ProductProps[]> {
  const res = await request<{ products?: ProductProps[] }>("/api/products/subscriptions", { method: "GET" });
  return res.products ?? [];
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
