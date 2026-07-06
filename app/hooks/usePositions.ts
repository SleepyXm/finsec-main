import { useEffect, useState } from "react";
import { Trade, TradePatch } from "@/app/types/trades";
import { fetchOpenPositions, updateTrade } from "@/app/handlers/positions";

export function usePositions(ticker: string, isBacktest = false) {
  const [positions, setPositions] = useState<Trade[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isBacktest) return;
    fetchOpenPositions()
      .then((all) => setPositions(all.filter((p) => p.symbol === ticker)))
      .catch((e) => setError(e.message));
  }, [ticker, isBacktest]);

  function handlePositionClosed(tradeId: string) {
    setPositions((prev) => prev.filter((p) => p.trade_id !== tradeId));
  }

  async function updatePosition(tradeId: string, patch: TradePatch) {
    try {
      const updated = await updateTrade(tradeId, patch);

      setPositions((prev) =>
        prev.map((position) =>
          position.trade_id === tradeId
            ? {
                ...position,
                ...updated,
              }
            : position
        )
      );

      setError(null);
      return updated;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update trade");
      throw e;
    }
  }

  return { positions, setPositions, handlePositionClosed, updatePosition, error };
}


type PositionPatch = TradePatch;

export function useEditPositions(
  setPositions: React.Dispatch<React.SetStateAction<Trade[]>>
) {
  const [editingTradeId, setEditingTradeId] = useState<string | null>(
    null
  );

  function startEditingPosition(tradeId: string) {
    setEditingTradeId(tradeId);
  }

  function stopEditingPosition() {
    setEditingTradeId(null);
  }

  async function updatePosition(tradeId: string, patch: PositionPatch) {
    const updated = await updateTrade(tradeId, patch);

    setPositions((prev) =>
      prev.map((position) =>
        position.trade_id === tradeId
          ? {
              ...position,
              ...updated,
            }
          : position
      )
    );

    return updated;
  }

  async function updateEditingPosition(patch: PositionPatch) {
    if (!editingTradeId) return null;

    return updatePosition(editingTradeId, patch);
  }

  return {
    editingPositionId: editingTradeId,
    startEditingPosition,
    stopEditingPosition,
    updatePosition,
    updateEditingPosition,
  };
}
