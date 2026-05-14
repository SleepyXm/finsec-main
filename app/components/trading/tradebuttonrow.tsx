
import { useState } from "react";
import { usePositions } from "@/app/hooks/usePositions";
import { useTrades } from "../../hooks/useTrades";
import TradeButtons from "./tradebuttons";
import OpenPositions from "./positions";
import { useStockSocket } from "@/app/hooks/useStockSocket"

interface TradeButtonRowProps {
  ticker: string;
  interval?: string;
}

export default function TradeButtonRow({
  ticker,
  interval = "1m",
}: TradeButtonRowProps) {
  const { positions, setPositions, handlePositionClosed, } = usePositions(ticker);
  const { placeTrade, closeTrade, error } = useTrades(positions, setPositions);
  const [accountUnrealisedPnL, setAccountUnrealisedPnL] = useState(0);
  const [quantity, setQuantity] = useState(1);

  
  const { tick, connected, livePnLMap } = useStockSocket(
    ticker,
    interval,
    positions, 
    handlePositionClosed,
    setAccountUnrealisedPnL
  );

  const handleTrade = async (action: "buy" | "sell") => {
    if (!tick) return;
    await placeTrade(action, tick, ticker, quantity);
  };

  return (
    <>
      {!connected && (
        <p className="text-xs text-yellow-500 mb-1">Connecting to feed...</p>
      )}
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
      <TradeButtons data={tick?.ticker === ticker ? tick : null} onTrade={handleTrade} quantity={quantity} onQuantityChange={setQuantity} />
      <OpenPositions
        positions={positions}
        livePnLMap={livePnLMap}
        onClose={(positionId) => closeTrade(positionId, tick?.close ?? 0)}
        accountUnrealisedPnL={accountUnrealisedPnL}
      />
    </>
  );
}