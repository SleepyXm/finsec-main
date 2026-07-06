"use client";

import React, { useCallback, useMemo } from "react";
import { AreaSeries, CandlestickSeries } from "lightweight-charts";
import { useChart } from "@/app/chart/chartrender/hooks/useChart";
import {
  ChartTheme,
  defaultChartTheme,
} from "@/app/chart/chartrender/themes/themes";

type ChartKind = "candlestick" | "line";

type ChartRendererProps = {
  type: ChartKind;
  data: any[];

  colors?: any;
  renderTradeUI?: React.ReactNode;

  trades?: any[];
  positions?: any[];
  livePnLMap?: Record<string, number>;

  isCreatingStrategy?: boolean;
  onClosePosition?: (id: string) => void;
  updatePosition?: (id: string, patch: any) => void | Promise<void>;
  onAnnotation?: (annotation: any) => void;
  onScrollLeft?: () => void;

  theme?: ChartTheme;
};

export function ChartRenderer({
  type,
  data,
  colors = {},
  renderTradeUI,
  trades = [],
  positions = [],
  livePnLMap = {},
  isCreatingStrategy = false,
  onAnnotation,
  onScrollLeft,
  onClosePosition,
  updatePosition,
  theme = defaultChartTheme,
}: ChartRendererProps) {
  const getPositionLabel = useCallback(
    (position: any) => {
      const id = position.trade_id;
      const pnl = livePnLMap[id] ?? 0;

      return (
        `${position.side.toUpperCase()} ` +
        `${position.symbol} ` +
        `${pnl >= 0 ? "+" : ""}` +
        `$${pnl.toFixed(2)}`
      );
    },
    [livePnLMap]
  );

  const seriesConstructor = useMemo(() => {
    return type === "candlestick" ? CandlestickSeries : AreaSeries;
  }, [type]);

  const seriesOptions = useMemo(() => {
    if (type === "candlestick") {
      return {
        upColor: theme.bullCandle,
        downColor: theme.bearCandle,
        borderUpColor: (theme as any).borderUpColor ?? theme.bullCandle,
        borderDownColor: (theme as any).borderDownColor ?? theme.bearCandle,
        wickUpColor: theme.wickUpColor,
        wickDownColor: theme.wickDownColor,
      };
    }

    return {
      lineColor: colors.lineColor ?? "#2962FF",
      topColor: colors.areaTopColor ?? "rgba(41,98,255,0.35)",
      bottomColor: colors.areaBottomColor ?? "rgba(41,98,255,0.05)",
    };
  }, [type, theme, colors]);

  const chartOptions = useMemo(() => {
    return {
      crosshair: {
        vertLine: { color: theme.crosshair },
        horzLine: { color: theme.crosshair },
      },
    };
  }, [theme]);

  const { chartElement } = useChart(
  seriesConstructor,
  seriesOptions,
  chartOptions,
  {
    data,
    trades,
    positions,
    livePnLMap,
    renderTradeUI,
    getPositionLabel,
    isCreatingStrategy,
    onAnnotation,
    onScrollLeft,
    onClosePosition,
    updatePosition,
    enableStrategyOverlay: type === "candlestick",
    enableIndicators: type === "candlestick",
  },
  theme
);

  return chartElement;
}
