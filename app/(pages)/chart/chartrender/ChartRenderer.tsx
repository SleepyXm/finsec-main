"use client";

import React, { useCallback, useMemo } from "react";
import { AreaSeries, CandlestickSeries } from "lightweight-charts";
import { useChart } from "@/app/(pages)/chart/chartrender/hooks/useChart";
import { ChartTheme, defaultChartTheme } from "@/app/(pages)/chart/chartrender/themes/themes";
import { AppliedIndicator } from "@/app/features/indicators/language/types";
import { RawData } from "@/app/components/types/charts";
import { useChartContext } from "@/app/(pages)/chart/chartcontext";
import type { SemanticMark } from "@/app/UI";
import type { StrategySnapshot } from "@/app/components/handlers/annotations";
import type { ValidationCandidate } from "@/app/(pages)/chart/SimilaritySearch/validation";

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
  semanticMarks?: SemanticMark[];
  formationCandidate?: ValidationCandidate | null;
  formationSnapshots?: StrategySnapshot[];
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
  semanticMarks = [],
  formationCandidate,
  formationSnapshots = [],
  theme = defaultChartTheme,
}: ChartRendererProps) {
  const { validation, strategyTeaching, adjustCandidateBoundary } = useChartContext();

  const teaching = minimal ? null : strategyTeaching;
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
      isCreatingStrategy,
      onAnnotation,
      onScrollLeft: teaching ? undefined : onScrollLeft,
      onClosePosition,
      updatePosition,
      enableStrategyOverlay: type === "candlestick",
      enableIndicators: type === "candlestick",
      appliedIndicators: teaching ? [] : appliedIndicators,
      fitContent: minimal || Boolean(teaching),
      validation: minimal ? undefined : validation,
      formationCandidate: minimal ? undefined : formationCandidate,
      formationSnapshots: minimal ? [] : formationSnapshots,
      adjustCandidateBoundary: minimal ? undefined : adjustCandidateBoundary,
      strategyTeaching: teaching,
      semanticMarks,
      semanticMarksCompact: minimal,
    },
    theme,
  );

  return chartElement;
}
