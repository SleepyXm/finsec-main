import { useEffect, useState } from "react";
import { Portfolio } from "../types/portfolio";
import { fetchPortfolio } from "../handlers/portfolio";

export function usePortfolio() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortfolio()
      .then(setPortfolio)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { portfolio, loading };
}