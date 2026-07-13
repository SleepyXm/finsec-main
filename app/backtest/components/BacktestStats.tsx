import type { BacktestAnalysis } from "@/app/backtest/analysis";
import type { BacktestCandle } from "@/app/types/backend";
import { cornerStyle, panelStyle, theme } from "@/app/ui";

interface Props {
  analysis: BacktestAnalysis;
  currentCandle: BacktestCandle | null;
  openPositions: number;
}

function money(value: number) {
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(2)}`;
}

export default function BacktestStats({ analysis, currentCandle, openPositions }: Props) {
  const currentDate = currentCandle
    ? new Date(currentCandle.time * 1000).toLocaleString()
    : "—";
  const metrics = [
    { label: "Balance", value: money(analysis.balance) },
    { label: "Net P&L", value: money(analysis.netPnl), signed: analysis.netPnl },
    { label: "Positions", value: `${openPositions} open · ${analysis.totalTrades} closed` },
    { label: "Current date", value: currentDate },
    { label: "Win rate", value: `${analysis.winRate.toFixed(1)}%` },
    { label: "Max drawdown", value: `${analysis.maxDrawdown.toFixed(2)}%` },
    { label: "Best trade", value: analysis.bestTrade == null ? "—" : money(analysis.bestTrade), signed: analysis.bestTrade },
    { label: "Worst trade", value: analysis.worstTrade == null ? "—" : money(analysis.worstTrade), signed: analysis.worstTrade },
  ];

  return (
    <section style={{ ...panelStyle(theme.dark), display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <div style={cornerStyle()} />
      {metrics.map(({ label, value, signed }, index) => (
        <div
          key={label}
          style={{
            padding: "10px 12px",
            minWidth: 0,
            borderRight: index % 2 === 0 ? `1px solid ${theme.dark.borderSoft}` : undefined,
            borderBottom: index < metrics.length - 2 ? `1px solid ${theme.dark.borderSoft}` : undefined,
          }}
        >
          <div style={{ color: theme.dark.muted2, fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase" }}>
            {label}
          </div>
          <div
            style={{
              color: signed == null
                ? theme.dark.text
                : signed >= 0 ? theme.dark.successText : theme.dark.errorText,
              fontSize: 12,
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={String(value)}
          >
            {value}
          </div>
        </div>
      ))}
    </section>
  );
}
