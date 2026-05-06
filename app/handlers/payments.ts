import { request } from "./auth";

export async function checkout(username: string) {
  return request("/checkout-session", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}