"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Interval } from "../types/charts";
import { useChartData } from "./chartdata";
import { useStockSocket } from "@/app/hooks/useStockSocket";
import { usePositions } from "@/app/hooks/usePositions";
import { useTrades } from "../hooks/useTrades";

const intervals: Interval[] = ["1m", "5m", "15m", "1h", "1d", "1wk", "1mo"];

interface ChartContextValue {
  // ticker
  shortname: string;
  intervals: Interval[];

  // interval + chart type
  interval: Interval;
  setInterval: (i: Interval) => void;
  isCandle: boolean;
  setIsCandle: (v: boolean) => void;

  // strategy
  isCreatingStrategy: boolean;
  setIsCreatingStrategy: (v: boolean) => void;
  annotations: any[];
  handleAnnotation: (a: any) => void;

  // live data
  tick: any;
  connected: boolean;
  chartData: any[];

  // positions + trades
  positions: any[];
  livePnLMap: Record<string, number>;
  accountUnrealisedPnL: number;
  placeTrade: (action: "buy" | "sell", tick: any, symbol: string) => void;
  closeTrade: (id: string, price: number) => void;
  handlePositionClosed: (id: string) => void;
  error: string | null;

  // router
  router: ReturnType<typeof useRouter>;
}

const ChartContext = createContext<ChartContextValue | null>(null);

export function useChartContext() {
  const ctx = useContext(ChartContext);
  if (!ctx) throw new Error("useChartContext must be used inside ChartProvider");
  return ctx;
}

export function ChartProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const symbolParam = typeof params.symbol === "string" ? decodeURIComponent(params.symbol) : "";
  const shortname = symbolParam.toUpperCase();

  const [interval, setInterval] = useState<Interval>("5m");
  const [isCandle, setIsCandle] = useState(true);
  const [isCreatingStrategy, setIsCreatingStrategy] = useState(false);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [accountUnrealisedPnL, setAccountUnrealisedPnL] = useState(0);

  const { positions, setPositions, handlePositionClosed } = usePositions(shortname);
  const { placeTrade, closeTrade, error } = useTrades(positions, setPositions);
  const { tick, historicalData, connected, livePnLMap } = useStockSocket(
    shortname, interval, positions, handlePositionClosed, setAccountUnrealisedPnL
  );
  const { data, updateLastCandle } = useChartData(shortname, interval, historicalData);

  useEffect(() => {
    if (!tick) return;
    updateLastCandle({
      time: tick.time,
      open: tick.open,
      high: tick.high,
      low: tick.low,
      close: tick.close,
    });
  }, [tick]);

  const chartData = isCandle
    ? data
    : data?.map((item: any) => ({ ...item, value: item.close }));

  const handleAnnotation = (annotation: any) => {
    setAnnotations(prev => [...prev, annotation]);
    setIsCreatingStrategy(false);
    console.log("annotation saved:", annotation);
  };

  return (
    <ChartContext.Provider
      value={{
        shortname,
        intervals,
        interval,
        setInterval,
        isCandle,
        setIsCandle,
        isCreatingStrategy,
        setIsCreatingStrategy,
        annotations,
        handleAnnotation,
        tick,
        connected,
        chartData: chartData ?? [],
        positions,
        livePnLMap,
        accountUnrealisedPnL,
        placeTrade,
        closeTrade,
        handlePositionClosed,
        error,
        router,
      }}
    >
      {children}
    </ChartContext.Provider>
  );
}