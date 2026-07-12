import { useMemo } from "react";
import { BaselineSeries, BaselineSeriesPartialOptions } from "lightweight-charts";
import { useChart } from "../hooks/useChart";
import { defaultChartTheme } from "../themes/themes";

interface PnLPoint {
  date?: string;
  time?: string | number;
  cumulative?: number;
  value?: number;
}

interface PnLChartColors {
  topLineColor?: string;
  bottomLineColor?: string;
  topFillColor1?: string;
  topFillColor2?: string;
  bottomFillColor1?: string;
  bottomFillColor2?: string;
  baselineValue?: number;
  backgroundColor?: string;
  textColor?: string;
}

interface PnLChartProps {
  data: PnLPoint[];
  colors?: PnLChartColors;
  height?: number;
}

function previousDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return date;
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function mapCurve(data: PnLPoint[], baselineValue: number) {
  const points = data.flatMap((point) => {
    const time = point.time ?? point.date;
    const value = point.value ?? point.cumulative;
    return time != null && Number.isFinite(value) ? [{ time, value: value as number }] : [];
  });

  if (points.length === 0) return [];

  const firstTime = points[0].time;
  const secondTime = points[1]?.time;
  const baselineTime = typeof firstTime === "number"
    ? firstTime - (
        typeof secondTime === "number" && secondTime > firstTime
          ? secondTime - firstTime
          : 1
      )
    : previousDate(firstTime);

  return [
    { time: baselineTime, value: baselineValue },
    ...points,
  ];
}

function RenderedPnLChart({
  data,
  colors,
  height,
}: Required<Pick<PnLChartProps, "colors" | "height">> & { data: ReturnType<typeof mapCurve> }) {
  const {
    topLineColor = "#26a69a",
    bottomLineColor = "#ef5350",
    topFillColor1 = "rgba(38, 166, 154, 0.22)",
    topFillColor2 = "rgba(38, 166, 154, 0.03)",
    bottomFillColor1 = "rgba(239, 83, 80, 0.03)",
    bottomFillColor2 = "rgba(239, 83, 80, 0.22)",
    baselineValue = 0,
    backgroundColor,
    textColor,
  } = colors;

  const seriesOptions = useMemo(() => ({
    baseValue: { type: "price" as const, price: baselineValue },
    topLineColor,
    bottomLineColor,
    topFillColor1,
    topFillColor2,
    bottomFillColor1,
    bottomFillColor2,
    lineWidth: 2,
    priceLineVisible: true,
    lastValueVisible: true,
  } satisfies BaselineSeriesPartialOptions), [
    baselineValue,
    bottomFillColor1,
    bottomFillColor2,
    bottomLineColor,
    topFillColor1,
    topFillColor2,
    topLineColor,
  ]);

  const chartTheme = useMemo(() => ({
    ...defaultChartTheme,
    ...(textColor ? { text: textColor } : {}),
    ...(backgroundColor
      ? { background: { type: "solid" as const, color: backgroundColor } }
      : {}),
  }), [backgroundColor, textColor]);

  const { chartElement } = useChart(
    BaselineSeries,
    seriesOptions,
    {
      timeScale: {
        fixLeftEdge: true,
        rightOffset: 2,
        borderVisible: false,
      },
      extra: {
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.16, bottom: 0.16 },
        },
        localization: {
          priceFormatter: (price: number) =>
            `${price < 0 ? "−" : ""}$${Math.abs(price).toFixed(2)}`,
        },
      },
    },
    { data },
    chartTheme,
  );

  return <div style={{ width: "100%", height }}>{chartElement}</div>;
}

export function PnLChart({ data, colors = {}, height = 224 }: PnLChartProps) {
  const baselineValue = colors.baselineValue ?? 0;
  const mapped = useMemo(() => mapCurve(data, baselineValue), [data, baselineValue]);

  if (mapped.length === 0) {
    return (
      <div style={{ height, display: "grid", placeItems: "center", color: colors.textColor, fontSize: 12 }}>
        No realised P&amp;L for this period
      </div>
    );
  }

  return <RenderedPnLChart data={mapped} colors={colors} height={height} />;
}
