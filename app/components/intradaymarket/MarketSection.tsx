import { useEffect, useRef, useState } from "react";
import { LinechartIntraday } from "@/app/(pages)/chart/chartrender/charts/LinechartIntraday";
import { fetchIntraday, type IntradayLinePoint } from "@/app/components/types/assets";
import { AssetPill } from "@/app/components/intradaymarket/components/UI";
import { EmptyState, LoadingState, theme, traderBlankButtonStyle, traderCornerStyle, traderInsetPanelStyle, traderPanelStyle } from "@/app/UI";

const ASSET_CARD_WIDTH = 280;
const ASSET_CARD_GAP = 12;
const ASSET_RAIL_BUTTON_WIDTH = 36;
const ASSET_RAIL_GAP = 8;
const ASSET_RAIL_PADDING = 12;

export function MarketSection({ title, items }: { title: string; items: { ticker: string, name: string, close: number,  }[] }) {
  const assetRailRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState(items[0]?.ticker ?? "");
  const [chartState, setChartState] = useState<{
    ticker: string;
    data: IntradayLinePoint[];
  }>({ ticker: "", data: [] });
  const [chartStatus, setChartStatus] = useState<"loading" | "ready" | "empty" | "error">(
    items.length ? "loading" : "empty",
  );
  const selectedItem = items.find((item) => item.ticker === selected);
  const selectedName = selectedItem?.name ?? selected;
  const chartData = chartState.ticker === selected ? chartState.data : [];

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;

    fetchIntraday(selected)
      .then((data) => {
        if (!cancelled) {
          setChartState({ ticker: selected, data });
          setChartStatus(data.length ? "ready" : "empty");
        }
      })
      .catch(() => {
        if (!cancelled) setChartStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const scrollAssetRail = (direction: -1 | 1) => {
    assetRailRef.current?.scrollBy({
      left: direction * (ASSET_CARD_WIDTH + ASSET_CARD_GAP),
      behavior: "smooth",
    });
  };

  return (
    <section className="mb-6 px-6">
      <div
        style={{
          ...traderPanelStyle(theme.dark),
          padding: "1rem",
          overflow: "hidden",
        }}
      >
        <div style={traderCornerStyle(0.42)} />

        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-5xl font-bold text-white">{title} ›</h2>
        </div>

        <div
          className="relative mb-4 overflow-hidden"
          style={{
            ...traderInsetPanelStyle(theme.dark),
            display: "grid",
            gridTemplateColumns: `${ASSET_RAIL_BUTTON_WIDTH}px minmax(0, 1fr) ${ASSET_RAIL_BUTTON_WIDTH}px`,
            gap: ASSET_RAIL_GAP,
            alignItems: "center",
            padding: ASSET_RAIL_PADDING,
          }}
        >
          <div style={traderCornerStyle(0.24)} />
          <button
            type="button"
            aria-label={`Scroll ${title} assets left`}
            onClick={() => scrollAssetRail(-1)}
            className="relative z-20 flex h-9 w-9 items-center justify-center text-sm"
            style={{
              ...traderBlankButtonStyle(),
              padding: 0,
            }}
          >
            {"<"}
          </button>

          <div
            ref={assetRailRef}
            className="finsec-asset-rail relative z-0 flex gap-3 overflow-x-hidden scrollbar-hide"
            style={{
              minWidth: 0,
              width: "100%",
              scrollSnapType: "x mandatory",
            }}
            onWheel={(event) => {
              if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
              if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

              event.preventDefault();
              event.currentTarget.scrollLeft += event.deltaY;
            }}
          >
            {items.map((item) => (
              <AssetPill
                key={item.ticker}
                ticker={item.ticker}
                name={item.name}
                close={item.close}
                selected={selected === item.ticker}
                onSelect={() => {
                  if (item.ticker === selected) return;
                  setChartStatus("loading");
                  setSelected(item.ticker);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label={`Scroll ${title} assets right`}
            onClick={() => scrollAssetRail(1)}
            className="relative z-20 flex h-9 w-9 items-center justify-center text-sm"
            style={{
              ...traderBlankButtonStyle(),
              padding: 0,
            }}
          >
            {">"}
          </button>
        </div>

        <div
          className="relative h-[320px] overflow-hidden"
          style={traderInsetPanelStyle(theme.dark)}
        >
          <div style={traderCornerStyle(0.22)} />
          {chartStatus === "ready" && chartData.length > 0 ? (
            <LinechartIntraday data={chartData} minimal />
          ) : chartStatus === "loading" ? (
            <LoadingState message={`Loading ${selectedName} chart…`} className="!h-full !bg-transparent" />
          ) : (
            <EmptyState
              icon={<span aria-hidden="true" className="text-xl">{chartStatus === "error" ? "!" : "—"}</span>}
              message={chartStatus === "error" ? "Chart data could not be loaded." : "No chart data is available."}
            />
          )}
        </div>

        <div
          className="relative mt-3 min-h-[104px] p-4"
          style={traderInsetPanelStyle(theme.dark)}
          aria-live="polite"
        >
          <div style={traderCornerStyle(0.2)} />
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-white">Relevant news</div>
            <div className="text-sm text-[#8a90a0]">{selectedName}</div>
          </div>
          <EmptyState
            icon={<span aria-hidden="true">—</span>}
            message="News integration is not available yet."
            className="!h-auto min-h-12"
          />
        </div>
      </div>
    </section>
  );
}
