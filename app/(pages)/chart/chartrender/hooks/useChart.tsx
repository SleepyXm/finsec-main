import React, { useEffect, useState } from "react";
import { ChartTheme, defaultChartTheme } from "../themes/themes";
import { PriceLines } from "@/app/components/trading/price";
import { StrategyOverlay } from "../overlays/Strategy";
import { StrategyTeachingOverlay } from "../overlays/StrategyTeachingOverlay";
import { SemanticMarksOverlay } from "../overlays/SemanticMarksOverlay";
import type { SemanticMark } from "@/app/UI";
import { useCandleHighlight } from "../overlays/CandleHighlight";
import { useScriptIndicators } from "@/app/features/indicators/hooks/useScriptIndicators";
import { AppliedIndicator } from "@/app/features/indicators/language/types";
import { PositionTags } from "../overlays/PositionOverlay";
import { ACCENT, DANGER, SUCCESS } from "@/app/UI";
import type {
  CandidateBoundaryAdjustment,
  ValidationCandidate,
  ValidationState,
} from "../../SimilaritySearch/validation";
import type { StrategyTeachingState } from "@/app/(pages)/chart/chartcontext";
import { buildValidationMarks } from "@/app/UI";
import type { StrategySnapshot } from "@/app/components/handlers/annotations";
import { useChartSurface } from "./useChartSurface";

type ChartPlugins = {
  data?: any[];
  trades?: any[];
  positions?: any[];
  livePnLMap?: Record<string, number>;
  renderTradeUI?: React.ReactNode;
  isCreatingStrategy?: boolean;
  onAnnotation?: (annotation: any) => void;
  onScrollLeft?: () => void;
  enableStrategyOverlay?: boolean;
  enableIndicators?: boolean;
  appliedIndicators?: AppliedIndicator[];
  getPositionLabel?: (position: any) => string;
  onClosePosition?: (id: string) => void;
  updatePosition?: (id: string, patch: any) => void | Promise<void>;
  fitContent?: boolean;
  validation?: ValidationState;
  formationCandidate?: ValidationCandidate | null;
  formationSnapshots?: StrategySnapshot[];
  strategyTeaching?: StrategyTeachingState | null;
  semanticMarks?: SemanticMark[];
  semanticMarksCompact?: boolean;
  adjustCandidateBoundary?: (adjustment: CandidateBoundaryAdjustment) => void;
};

export function useChart(
  seriesConstructor: any,
  seriesOptions: any = {},
  chartOptions: any = {},
  plugins: ChartPlugins = {},
  theme: ChartTheme = defaultChartTheme,
) {
  const surface = useChartSurface(seriesConstructor, seriesOptions, chartOptions, theme);
  const {
    containerRef,
    priceLinesRef,
    positionLinesRef,
    chartKey,
  } = surface;
  const chartRef = surface.chartRef as React.MutableRefObject<any>;
  const seriesRef = surface.seriesRef as React.MutableRefObject<any>;
  const [overlayVersion, setOverlayVersion] = useState(0);

  const data = plugins.data ?? [];
  const trades = plugins.trades ?? [];
  const positions = plugins.positions ?? [];

  useEffect(() => {
    if (!seriesRef.current) return;

    if (!chartRef.current || !containerRef.current) {
      seriesRef.current.setData(data);
      return;
    }

    if (plugins.fitContent) {
      seriesRef.current.setData(data);
      chartRef.current.timeScale().fitContent();
      return;
    }

    if (data.length < 2) {
      seriesRef.current.setData(data);
      return;
    }

    const interval = data[1].time - data[0].time;
    const lastCandle = data[data.length - 1];
    const barSpacing = chartRef.current.timeScale().options().barSpacing;
    const containerWidth = containerRef.current.clientWidth;

    if (
      !Number.isFinite(interval) ||
      interval <= 0 ||
      !Number.isFinite(barSpacing) ||
      barSpacing <= 0 ||
      !containerWidth
    ) {
      seriesRef.current.setData(data);
      return;
    }

    const visibleBars = Math.ceil(containerWidth / barSpacing);
    const whitespace = [];

    for (let index = 1; index <= visibleBars; index += 1) {
      whitespace.push({ time: lastCandle.time + interval * index });
    }

    seriesRef.current.setData([...data, ...whitespace]);
  }, [data, chartKey, plugins.fitContent]);

  useEffect(() => {
    if (!seriesRef.current) return;
    PriceLines(seriesRef, priceLinesRef, trades);
  }, [trades, chartKey]);

  useEffect(() => {
    if (!positions.length) return;

    const frame = requestAnimationFrame(() => {
      setOverlayVersion((version) => version + 1);
    });

    return () => cancelAnimationFrame(frame);
  }, [positions, data, chartKey]);

  useEffect(() => {
    if (!chartRef.current || !containerRef.current || !positions.length) return;

    const chart = chartRef.current;
    let frame: number | null = null;

    const invalidateOverlay = () => {
      if (frame != null) return;

      frame = requestAnimationFrame(() => {
        frame = null;
        setOverlayVersion((version) => version + 1);
      });
    };

    const observer = new ResizeObserver(invalidateOverlay);
    observer.observe(containerRef.current);

    chart.timeScale().subscribeVisibleLogicalRangeChange(invalidateOverlay);
    invalidateOverlay();

    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(invalidateOverlay);
    };
  }, [positions.length, chartKey]);

  useEffect(() => {
    if (!seriesRef.current) return;

    const active = new Set<string>();

    positions.forEach((position) => {
      const rawId = position.trade_id;
      if (rawId == null) return;

      const id = String(rawId);
      const entryPrice = Number(position.entry_price ?? position.entryPrice ?? position.price);

      if (!Number.isFinite(entryPrice)) return;

      const lines = [{
        key: `${id}:entry`,
        price: entryPrice,
        color: position.side === "short" ? DANGER : ACCENT,
        title:
          plugins.getPositionLabel?.(position) ??
          `${position.side?.toUpperCase?.() ?? ""} ${position.symbol ?? ""}`,
        lineStyle: 0,
      }];

      if (position.stop_loss != null) {
        const stopLoss = Number(position.stop_loss);

        lines.push({
          key: `${id}:stop_loss`,
          price: stopLoss,
          color: DANGER,
          title: `SL ${stopLoss.toFixed(2)}`,
          lineStyle: 0,
        });
      }

      if (position.take_profit != null) {
        const takeProfit = Number(position.take_profit);

        lines.push({
          key: `${id}:take_profit`,
          price: takeProfit,
          color: SUCCESS,
          title: `TP ${takeProfit.toFixed(2)}`,
          lineStyle: 0,
        });
      }

      lines.forEach((lineConfig) => {
        if (!Number.isFinite(lineConfig.price)) return;

        active.add(lineConfig.key);
        const existing = positionLinesRef.current.get(lineConfig.key);

        if (existing) {
          existing.applyOptions({
            price: lineConfig.price,
            title: "",
            color: lineConfig.color,
            lineStyle: lineConfig.lineStyle,
            axisLabelVisible: true,
          });
          return;
        }

        const line = seriesRef.current.createPriceLine({
          price: lineConfig.price,
          color: lineConfig.color,
          lineWidth: 1,
          lineStyle: lineConfig.lineStyle,
          axisLabelVisible: true,
          title: "",
        });

        positionLinesRef.current.set(lineConfig.key, line);
      });
    });

    positionLinesRef.current.forEach((line, key) => {
      if (!active.has(key)) {
        seriesRef.current.removePriceLine(line);
        positionLinesRef.current.delete(key);
      }
    });
  }, [positions, plugins.getPositionLabel, chartKey]);

  useEffect(() => {
    if (!chartRef.current || !plugins.onScrollLeft) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let requestedForCurrentData = false;

    const handler = (range: any) => {
      if (timeout) clearTimeout(timeout);

      if (!range || range.from >= 0) {
        requestedForCurrentData = false;
        return;
      }

      if (requestedForCurrentData) return;

      timeout = setTimeout(() => {
        requestedForCurrentData = true;
        plugins.onScrollLeft?.();
      }, 120);
    };

    const timeScale = chartRef.current.timeScale();

    timeScale.subscribeVisibleLogicalRangeChange(handler);
    handler(timeScale.getVisibleLogicalRange());

    return () => {
      if (timeout) clearTimeout(timeout);
      timeScale.unsubscribeVisibleLogicalRangeChange(handler);
    };
  }, [plugins.onScrollLeft, chartKey, data.length]);

  useScriptIndicators(
    chartRef,
    seriesRef,
    data,
    plugins.enableIndicators && !plugins.strategyTeaching ? plugins.appliedIndicators ?? [] : [],
    chartKey,
  );

  const manualCandidate = plugins.validation?.active ? plugins.validation.candidate : null;
  const hasFormationOverride = plugins.formationCandidate !== undefined;
  const validationCandidate = hasFormationOverride
    ? plugins.formationCandidate
    : manualCandidate;
  const validationSnapshots = hasFormationOverride
    ? plugins.formationSnapshots ?? []
    : plugins.validation?.active ? plugins.validation.snapshots : [];

  const semanticMarks =
    validationCandidate && validationSnapshots.length
      ? buildValidationMarks(validationCandidate, validationSnapshots)
      : plugins.semanticMarks ?? [];

  const focusCandidate = hasFormationOverride ? null : validationCandidate;
  const candidateFrom = focusCandidate?.candles[0]?.time;
  const candidateTo = focusCandidate?.candles[focusCandidate.candles.length - 1]?.time;

  useEffect(() => {
    if (candidateFrom == null || candidateTo == null || !chartRef.current) return;

    const candleCount = focusCandidate?.candles.length ?? 0;
    const span = Math.max(1, candidateTo - candidateFrom);
    const candleSpan = span / Math.max(1, candleCount - 1);
    const padding = Math.max(span * 0.15, candleSpan * 2);

    chartRef.current.timeScale().setVisibleRange({
      from: candidateFrom - padding,
      to: candidateTo + padding,
    });
  }, [candidateFrom, candidateTo, chartKey]);

  const { setSelection, clearSelection } = useCandleHighlight({
    chartRef,
    seriesRef,
    containerRef,
    data,
    active: Boolean(plugins.enableStrategyOverlay && plugins.isCreatingStrategy),
    candidate: validationCandidate,
  });

  const chartElement = (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={containerRef}
        className="finsec-chart-surface"
        style={{ width: "100%", height: "100%" }}
      />

      {plugins.renderTradeUI && (
        <div style={{ position: "absolute", top: 42, left: 10, zIndex: 10 }}>
          {plugins.renderTradeUI}
        </div>
      )}

      {plugins.enableStrategyOverlay && plugins.isCreatingStrategy && (
        <StrategyOverlay
          chartRef={chartRef}
          seriesRef={seriesRef}
          data={data}
          onAnnotation={plugins.onAnnotation}
          setSelection={setSelection}
          clearSelection={clearSelection}
        />
      )}

      {semanticMarks.length > 0 && (
        <SemanticMarksOverlay
          chartRef={chartRef}
          seriesRef={seriesRef}
          data={validationCandidate?.candles ?? data}
          marks={semanticMarks}
          compact={plugins.semanticMarksCompact}
          interactive={Boolean(manualCandidate && !hasFormationOverride)}
          onAdjustBoundary={hasFormationOverride ? undefined : plugins.adjustCandidateBoundary}
        />
      )}

      {plugins.strategyTeaching && (
        <StrategyTeachingOverlay chartRef={chartRef} seriesRef={seriesRef} data={data} />
      )}

      {!plugins.strategyTeaching && positions.length > 0 && (
        <PositionTags
          positions={positions}
          livePnLMap={plugins.livePnLMap ?? {}}
          seriesRef={seriesRef}
          renderVersion={overlayVersion}
          onClosePosition={plugins.onClosePosition}
          updatePosition={plugins.updatePosition}
        />
      )}
    </div>
  );

  return { containerRef, chartRef, seriesRef, chartElement };
}
