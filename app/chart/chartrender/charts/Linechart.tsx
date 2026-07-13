"use client";

import React, { useEffect, useMemo } from "react";
import { AreaSeries } from "lightweight-charts";
import { useChart } from "../hooks/useChart";
import { intradayChartTheme, type ChartTheme } from "../themes/themes";

export const LinechartIntraday: React.FC<{
  data: any[];
  colors?: any;
  minimal?: boolean;
  theme?: ChartTheme;
}> = ({
  data,
  colors = {},
  minimal = false,
  theme = intradayChartTheme,
}) => {
  const lineData = useMemo(() => {
    return data
      .filter((item) => item?.time != null)
      .map((item) => ({
        time: item.time,
        value: Number(item.value ?? item.close),
      }))
      .filter((item) => Number.isFinite(item.value));
  }, [data]);

  const first = lineData[0]?.value ?? 0;
  const last = lineData[lineData.length - 1]?.value ?? 0;
  const isUp = last >= first;

  const seriesOptions = useMemo(
    () => ({
      lineColor: isUp
        ? colors.lineColor ?? theme.lineUp
        : colors.lineColor ?? theme.lineDown,
      topColor: isUp
        ? colors.areaTopColor ?? theme.areaTopUp
        : colors.areaTopColor ?? theme.areaTopDown,
      bottomColor: isUp
        ? colors.areaBottomColor ?? theme.areaBottomUp
        : colors.areaBottomColor ?? theme.areaBottomDown,
      lineWidth: 1,
      lastValueVisible: true,
      priceLineVisible: false,
    }),
    [isUp, colors, theme]
  );

  const chartOptions = useMemo(
    () => ({
      timeScale: {
        fixLeftEdge: true,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { visible: true },
        horzLine: { visible: !minimal },
      },
      extra: {
        rightPriceScale: { visible: true },
        handleScroll: !minimal,
        handleScale: !minimal,
      },
    }),
    [minimal]
  );

  const { chartElement, chartRef } = useChart(
    AreaSeries,
    seriesOptions,
    chartOptions,
    {
      data: lineData,
    },
    theme
  );

  useEffect(() => {
    if (!chartRef.current || lineData.length === 0) return;

    chartRef.current.timeScale().fitContent();
  }, [chartRef, lineData.length]);

  return (
    <div style={{ width: "100%", height: "300px" }}>
      {chartElement}
    </div>
  );
};
