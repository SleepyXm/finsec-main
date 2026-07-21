import { Metadata } from "next";
import CheckoutSuccess from "./CheckoutSuccess";

export const metadata: Metadata = {
  title: "FinSec - Checkout Success",
};

type CheckoutSuccessPageProps = {
  searchParams: Promise<{
    session_id?: string | string[];
  }>;
};

export default async function CheckoutSuccessPage({
  searchParams,
}: CheckoutSuccessPageProps) {
  const query = await searchParams;
  const sessionId = Array.isArray(query.session_id)
    ? query.session_id[0]
    : query.session_id;

  return <CheckoutSuccess sessionId={sessionId ?? null} />;
}
