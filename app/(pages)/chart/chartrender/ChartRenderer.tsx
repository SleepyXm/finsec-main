"use client";

import React, { useCallback, useMemo } from "react";
import { AreaSeries, CandlestickSeries } from "lightweight-charts";
import { useChart } from "@/app/(pages)/chart/chartrender/hooks/useChart";
import { ChartTheme, defaultChartTheme } from "@/app/(pages)/chart/chartrender/themes/themes";
import { AppliedIndicator } from "@/app/features/indicators/language/types";
import { RawData } from "@/app/components/types/charts";
import type {
  SemanticMark,
  StrategyChartController,
} from "@/app/features/StrategyEngine/types";

type ChartKind = "candlestick" | "line";

type ChartRendererProps = {
  type: ChartKind;
  data: RawData[];
  colors?: any;
  renderTradeUI?: React.ReactNode;
  trades?: any[];
  positions?: any[];
  livePnLMap?: Record<string, number>;
  onClosePosition?: (id: string) => void;
  updatePosition?: (id: string, patch: any) => void | Promise<void>;
  onScrollLeft?: () => void;
  appliedIndicators?: AppliedIndicator[];
  minimal?: boolean;
  semanticMarks?: SemanticMark[];
  theme?: ChartTheme;
  strategy?: StrategyChartController;
};

export function ChartRenderer({
  type,
  data,
  colors = {},
  renderTradeUI,
  trades = [],
  positions = [],
  livePnLMap = {},
  onScrollLeft,
  onClosePosition,
  updatePosition,
  appliedIndicators = [],
  minimal = false,
  semanticMarks = [],
  theme = defaultChartTheme,
  strategy,
}: ChartRendererProps) {
  const teaching =
    minimal ? null : strategy?.strategyTeaching;
  const renderedData = teaching?.snapshot.candles ?? data;

  const getPositionLabel = useCallback((position: any) => {
    const id = position.trade_id;
    const pnl = livePnLMap[id] ?? 0;

    return `${position.side.toUpperCase()} ${position.symbol} ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`;
  }, [livePnLMap]);

  const seriesConstructor = useMemo(
    () => type === "candlestick" ? CandlestickSeries : AreaSeries,
    [type],
  );

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

  const chartOptions = useMemo(() => ({
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
  }), [minimal, theme]);

  const { chartElement } = useChart(
    seriesConstructor,
    seriesOptions,
    chartOptions,
    {
      data: renderedData,
      trades: teaching ? [] : trades,
      positions: teaching ? [] : positions,
      livePnLMap,
      renderTradeUI: teaching ? undefined : renderTradeUI,
      getPositionLabel,
      onScrollLeft: teaching ? undefined : onScrollLeft,
      onClosePosition,
      updatePosition,
      enableStrategyOverlay: type === "candlestick",
      enableIndicators: type === "candlestick",
      appliedIndicators: teaching ? [] : appliedIndicators,
      fitContent: minimal || Boolean(teaching),
      strategy: minimal ? undefined : strategy,
      semanticMarks,
      semanticMarksCompact: minimal,
    },
    theme,
  );

  return chartElement;
}
