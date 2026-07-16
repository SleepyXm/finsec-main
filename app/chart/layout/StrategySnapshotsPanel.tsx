import type { StrategyDetails } from "@/app/handlers/annotations";
import { CandleStickChart } from "@/app/chart/chartrender/charts/CandleStickChart";
import type { ChartTheme } from "@/app/chart/chartrender/themes/themes";
import { cornerStyle, theme } from "@/app/ui";

const idleBackground = "rgba(238,242,247,0.025)";

export function StrategySnapshotsPanel({
  strategy,
  onBack,
  onDeleteStrategy,
  onDeleteSnapshot,
  deleting,
  error,
  chartTheme,
}: {
  strategy: StrategyDetails;
  onBack: () => void;
  onDeleteStrategy: () => void;
  onDeleteSnapshot: (index: number) => void;
  deleting: boolean;
  error: string | null;
  chartTheme: ChartTheme;
}) {
  return (
    <div style={{ padding: 12 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          border: 0,
          background: "transparent",
          color: theme.dark.muted,
          padding: 0,
          fontFamily: "inherit",
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        ← Strategies
      </button>

      <div style={{ display: "flex", alignItems: "start", gap: 8, marginTop: 14, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: theme.dark.text, fontSize: 13 }}>
            {strategy.title.replace(/_/g, " ")}
          </div>
          <div style={{ color: theme.dark.muted2, fontSize: 10, marginTop: 3 }}>
            {strategy.snapshot_count} {strategy.snapshot_count === 1 ? "snapshot" : "snapshots"}
          </div>
        </div>
        <button
          type="button"
          disabled={deleting}
          onClick={onDeleteStrategy}
          style={{
            border: 0,
            background: "transparent",
            color: theme.dark.errorText,
            padding: 0,
            fontFamily: "inherit",
            fontSize: 10,
            cursor: deleting ? "wait" : "pointer",
            opacity: deleting ? 0.45 : 1,
          }}
        >
          Delete strategy
        </button>
      </div>

      {error && (
        <div style={{ color: theme.dark.errorText, background: theme.dark.errorBg, padding: 9, fontSize: 10, marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {strategy.snapshots.map((snapshot, index) => (
          <article
            key={`${snapshot.annotated_at}-${index}`}
            style={{
              position: "relative",
              minWidth: 0,
              border: `1px solid ${theme.dark.borderSoft}`,
              background: idleBackground,
            }}
          >
            <div style={cornerStyle()} />
            <div style={{ height: 96, borderBottom: `1px solid ${theme.dark.borderSoft}` }}>
              <CandleStickChart data={snapshot.candles} minimal theme={chartTheme} />
            </div>
            <div style={{ padding: "8px 9px 9px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, color: theme.dark.text, fontSize: 11 }}>
                  Snapshot {index + 1}
                </div>
                <button
                  type="button"
                  aria-label={`Delete snapshot ${index + 1}`}
                  disabled={deleting}
                  onClick={() => onDeleteSnapshot(index)}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: theme.dark.errorText,
                    padding: 0,
                    fontSize: 14,
                    cursor: deleting ? "wait" : "pointer",
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ color: theme.dark.muted2, fontSize: 9, marginTop: 3 }}>
                {snapshot.symbol} · {new Date(snapshot.annotated_at).toLocaleString()}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
