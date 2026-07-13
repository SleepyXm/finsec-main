import CheckoutSuccess from "./CheckoutSuccess";

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