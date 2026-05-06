import { PriceLineOptions } from "lightweight-charts";
import { Trade } from "@/app/types/trades";

export function PriceLines(
  seriesRef: React.MutableRefObject<any | null>,
  priceLinesRef: React.MutableRefObject<any[]>,
  trades: Trade[]
) {
  if (!seriesRef.current) return;

  priceLinesRef.current.forEach((line) => {
    seriesRef.current.removePriceLine(line);
  });
  priceLinesRef.current = [];

  trades.forEach((trade) => {
    if (typeof trade.entry_price !== "number") return;

    const options: PriceLineOptions = {
        price: trade.entry_price,
        color: trade.side === "long" ? "#00FF8F" : "#FF3C3C",
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        axisLabelColor: "black",
        axisLabelTextColor: "white",
        lineVisible: true,
        title: `${trade.side.toUpperCase()} @ ${trade.entry_price.toFixed(2)}`,
    };

    const priceLine = seriesRef.current.createPriceLine(options);
    priceLinesRef.current.push(priceLine);
  });
}