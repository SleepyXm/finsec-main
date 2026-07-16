import { ChartRenderer } from "@/app/chart/chartrender/ChartRenderer";
import { defaultChartTheme, ChartTheme } from "@/app/chart/chartrender/themes/themes";
import { Candle } from "@/app/types/charts";

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
