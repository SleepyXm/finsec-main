import { request }  from "./auth"

export interface ProductProps {
    product_id: string;
    product_name: string;
    price: number;
    stripe_price_id: string;
}

export async function getProducts(): Promise<ProductProps[]> {
  const res = await request("/products/products", { method: "GET" });
  return res.products;
}