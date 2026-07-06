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


type PositionPatch = Partial<Omit<Trade, "position_id">>;

export function useEditPositions(
  setPositions: React.Dispatch<React.SetStateAction<Trade[]>>
) {
  const [editingPositionId, setEditingPositionId] = useState<string | null>(
    null
  );

  function startEditingPosition(positionId: string) {
    setEditingPositionId(positionId);
  }

  function stopEditingPosition() {
    setEditingPositionId(null);
  }

  function updatePosition(positionId: string, patch: PositionPatch) {
    setPositions((prev) =>
      prev.map((position) =>
        position.position_id === positionId
          ? {
              ...position,
              ...patch,
            }
          : position
      )
    );
  }

  function updateEditingPosition(patch: PositionPatch) {
    if (!editingPositionId) return;

    updatePosition(editingPositionId, patch);
  }

  return {
    editingPositionId,
    startEditingPosition,
    stopEditingPosition,
    updatePosition,
    updateEditingPosition,
  };
}