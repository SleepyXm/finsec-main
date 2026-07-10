import { request } from "./auth";

export async function checkout(priceId: string) {
  return request<{ url: string; session_id: string }>("/api/products/checkout-session", {
    method: "POST",
    body: JSON.stringify({ price_id: priceId }),
  });
}
