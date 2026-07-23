"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CHART_INTERVALS,
  type Candle,
  type Interval,
  type RawData,
} from "@/app/components/types/charts";
import { useChartData } from "./chartdata";
import { useStockSocket } from "@/app/components/hooks/useStockSocket";
import { usePositions } from "@/app/components/hooks/usePositions";
import { useTrades } from "@/app/components/hooks/useTrades";
import type { AppliedIndicator } from "@/app/features/indicators/language/types";
import type { StockTick } from "@/app/components/types/websocket";

interface ChartContextValue {
  shortname: string;
  intervals: Interval[];
  interval: Interval;
  setInterval: (interval: Interval) => void;
  isCandle: boolean;
  setIsCandle: (value: boolean) => void;
  isIndicatorPanelOpen: boolean;
  setIsIndicatorPanelOpen: (value: boolean) => void;
  appliedIndicators: AppliedIndicator[];
  applyIndicator: (indicator: AppliedIndicator) => void;
  removeIndicator: (id: string) => void;
  setIndicatorEnabled: (id: string, enabled: boolean) => void;
  tick: StockTick | null;
  connected: boolean;
  chartData: Candle[];
  positions: any[];
  livePnLMap: Record<string, number>;
  accountUnrealisedPnL: number;
  placeTrade: (
    action: "buy" | "sell",
    tick: Pick<RawData, "buy_price" | "close">,
    symbol: string,
    quantity: number,
  ) => void;
  closeTrade: (id: string, price: number) => void;
  tradeReady: boolean;
  tradePending: boolean;
  updatePosition: (
    id: string,
    patch: any,
  ) => Promise<any>;
  handlePositionClosed: (id: string) => void;
  error: string | null;
  router: ReturnType<typeof useRouter>;
  loadingMore: boolean;
  loadPreviousPage: () => void;
}

const ChartContext =
  createContext<ChartContextValue | null>(null);

export function useChartContext() {
  const context = useContext(ChartContext);

  if (!context) {
    throw new Error(
      "useChartContext must be used inside ChartProvider",
    );
  }

  return context;
}

export function ChartProvider({
  children,
  symbol,
  intervalOverride,
  isCandleOverride,
}: {
  children: ReactNode;
  symbol?: string;
  intervalOverride?: Interval;
  isCandleOverride?: boolean;
}) {
  const params = useParams();
  const router = useRouter();
  const symbolParam =
    symbol ??
    (
      typeof params.symbol === "string"
        ? decodeURIComponent(params.symbol)
        : ""
    );
  const shortname = symbolParam.toUpperCase();
  const [
    localInterval,
    setInterval,
  ] = useState<Interval>(
    intervalOverride ?? "5m",
  );
  const [
    localIsCandle,
    setIsCandle,
  ] = useState(
    isCandleOverride ?? true,
  );
  const [
    isIndicatorPanelOpen,
    setIsIndicatorPanelOpen,
  ] = useState(false);
  const [
    appliedIndicators,
    setAppliedIndicators,
  ] = useState<AppliedIndicator[]>([]);
  const [
    accountUnrealisedPnL,
    setAccountUnrealisedPnL,
  ] = useState(0);
  const interval =
    intervalOverride ?? localInterval;
  const isCandle =
    isCandleOverride ?? localIsCandle;

  const applyIndicator = useCallback(
    (indicator: AppliedIndicator) => {
      setAppliedIndicators((current) => {
        const existingIndex = current.findIndex(
          (entry) => entry.id === indicator.id,
        );

        if (existingIndex === -1) {
          return [
            ...current,
            indicator,
          ];
        }

        const next = [...current];
        next[existingIndex] = indicator;

        return next;
      });
    },
    [],
  );

  const removeIndicator = useCallback((id: string) => {
    setAppliedIndicators((current) =>
      current.filter((entry) => entry.id !== id),
    );
  }, []);

  const setIndicatorEnabled = useCallback(
    (
      id: string,
      enabled: boolean,
    ) => {
      setAppliedIndicators((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                enabled,
              }
            : entry,
        ),
      );
    },
    [],
  );

  const {
    positions,
    setPositions,
    handlePositionClosed,
    updatePosition,
  } = usePositions(shortname);

  const {
    placeTrade,
    closeTrade,
    error,
    ready: tradeReady,
    placing: tradePending,
  } = useTrades(
    positions,
    setPositions,
  );

  const {
    tick,
    historicalData,
    connected,
    livePnLMap,
    loadingMore,
    loadPreviousPage,
  } = useStockSocket(
    shortname,
    interval,
    positions,
    handlePositionClosed,
    setAccountUnrealisedPnL,
  );

  const {
    data,
    updateLastCandle,
  } = useChartData(
    shortname,
    interval,
    historicalData,
  );

  useEffect(() => {
    if (!tick) return;

    updateLastCandle({
      time: tick.time,
      open: tick.open,
      high: tick.high,
      low: tick.low,
      close: tick.close,
      volume: tick.volume,
      buy_price: tick.buy_price,
    });
  }, [tick]);

  const chartData = isCandle
    ? data
    : data?.map((item) => ({
        ...item,
        value: item.close,
      }));

  return (
    <ChartContext.Provider
      value={{
        shortname,
        intervals: [...CHART_INTERVALS],
        interval,
        setInterval,
        isCandle,
        setIsCandle,
        isIndicatorPanelOpen,
        setIsIndicatorPanelOpen,
        appliedIndicators,
        applyIndicator,
        removeIndicator,
        setIndicatorEnabled,
        tick,
        connected,
        chartData: chartData ?? [],
        positions,
        livePnLMap,
        accountUnrealisedPnL,
        placeTrade,
        closeTrade,
        tradeReady,
        tradePending,
        updatePosition,
        handlePositionClosed,
        error,
        router,
        loadingMore,
        loadPreviousPage,
      }}
    >
      {children}
    </ChartContext.Provider>
  );
}
