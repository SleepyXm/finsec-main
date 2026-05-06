import { useEffect, useState } from "react";
import { Trade } from "@/app/types/trades";
import { fetchOpenPositions } from "@/app/handlers/positions";

export function usePositions(ticker: string, isBacktest = false) {
  const [positions, setPositions] = useState<Trade[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isBacktest) return;
    fetchOpenPositions()
      .then((all) => setPositions(all.filter((p) => p.symbol === ticker)))
      .catch((e) => setError(e.message));
  }, [ticker, isBacktest]);

  function handlePositionClosed(positionId: string) {
    setPositions((prev) => prev.filter((p) => p.position_id !== positionId));
  }

  return { positions, setPositions, handlePositionClosed, error };
}