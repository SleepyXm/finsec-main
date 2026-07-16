"use client";

import React, { useCallback, useMemo } from "react";
import { AreaSeries, CandlestickSeries } from "lightweight-charts";
import { useChart } from "@/app/chart/chartrender/hooks/useChart";
import { ChartTheme, defaultChartTheme } from "@/app/chart/chartrender/themes/themes";
import { AppliedIndicator } from "@/app/indicators/language/types";
import { RawData } from "@/app/types/charts";

type ChartKind = "candlestick" | "line";

type ChartRendererProps = {
  type: ChartKind;
  data: RawData[];

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
  appliedIndicators?: AppliedIndicator[];
  minimal?: boolean;

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
  appliedIndicators = [],
  minimal = false,
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
        borderUpColor: theme.borderUpColor ?? theme.bullCandle,
        borderDownColor: theme.borderDownColor ?? theme.bearCandle,
        wickUpColor: theme.wickUpColor,
        wickDownColor: theme.wickDownColor,
        priceLineVisible: !minimal,
        lastValueVisible: !minimal,
      };
    }

    return {
      lineColor: colors.lineColor ?? "#2962FF",
      topColor: colors.areaTopColor ?? "rgba(41,98,255,0.35)",
      bottomColor: colors.areaBottomColor ?? "rgba(41,98,255,0.05)",
    };
  }, [type, theme, colors, minimal]);

  const chartOptions = useMemo(() => {
    return {
      crosshair: {
        vertLine: { color: theme.crosshair, visible: !minimal },
        horzLine: { color: theme.crosshair, visible: !minimal },
      },
      timeScale: minimal
        ? { visible: false, borderVisible: false, rightOffset: 0 }
        : undefined,
      extra: minimal
        ? {
            rightPriceScale: { visible: false, borderVisible: false },
            handleScroll: false,
            handleScale: false,
          }
        : undefined,
    };
  }, [minimal, theme]);

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
      appliedIndicators,
      fitContent: minimal,
    },
    theme
  );

  return chartElement;
}
