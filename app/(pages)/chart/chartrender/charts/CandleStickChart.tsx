import { ChartRenderer } from "@/app/(pages)/chart/chartrender/ChartRenderer";
import { defaultChartTheme, ChartTheme } from "@/app/(pages)/chart/chartrender/themes/themes";
import { Candle } from "@/app/components/types/charts";
import type { SemanticMark } from "@/app/UI";

export function CandleStickChart({
  data,
  minimal = false,
  theme = defaultChartTheme,
  semanticMarks = [],
}: {
  data: Candle[];
  minimal?: boolean;
  theme?: ChartTheme;
  semanticMarks?: SemanticMark[];
}) {
  return (
    <ChartRenderer
      type="candlestick"
      data={data}
      minimal={minimal}
      theme={theme}
      semanticMarks={semanticMarks}
    />
  );
}
