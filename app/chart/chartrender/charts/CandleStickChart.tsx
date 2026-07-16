import { ChartRenderer } from "@/app/chart/chartrender/ChartRenderer";
import {
  defaultChartTheme,
  type ChartTheme,
} from "@/app/chart/chartrender/themes/themes";
import type { Candle } from "@/app/types/charts";

export function CandleStickChart({
  data,
  minimal = false,
  theme = defaultChartTheme,
}: {
  data: Candle[];
  minimal?: boolean;
  theme?: ChartTheme;
}) {
  return (
    <ChartRenderer
      type="candlestick"
      data={data}
      minimal={minimal}
      theme={theme}
    />
  );
}
