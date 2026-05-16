import { useEffect, useState, useRef, useCallback } from "react";
import { PositionCursor, TradeHistoryRow, TradeHistory } from "../types/portfolio";
import { AccountStats, JournalResponse, PnLCurveResponse, PnLPeriod } from "../types/accounts";
import { fetchPortfolioPage } from "../handlers/portfolio";
import { fetchAccountStats, fetchJournal, fetchPnLCurve } from "../handlers/accounts";

function toRow(t: TradeHistory): TradeHistoryRow {
  return {
    id:           t.id,
    symbol:       t.symbol,
    side:         t.side.charAt(0).toUpperCase() + t.side.slice(1),
    entry_price:  `$${t.entry_price.toFixed(2)}`,
    exit_price:   t.exit_price != null ? `$${t.exit_price.toFixed(2)}` : "—",
    quantity:     t.quantity,
    realised_pnl: t.realised_pnl != null
      ? `${t.realised_pnl >= 0 ? "+" : "-"}$${Math.abs(t.realised_pnl).toFixed(2)}`
      : "—",
    rr:   "—",
    date: new Date(t.opened_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    note: "",
  };
}

// ── usePortfolio ─────────────────────────────────────────────────────────────
// Paginated trade history only — no stats.
export function usePortfolio() {
  const [rows, setRows]     = useState<TradeHistoryRow[]>([]);
  const [cursor, setCursor] = useState<PositionCursor | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = cursor !== null && cursor !== undefined;

  useEffect(() => {
    fetchPortfolioPage()
      .then((page) => {
        setRows(page.history.map(toRow));
        setCursor(page.next_cursor);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const loadNext = useCallback(async () => {
    if (!hasMore) return;
    setLoading(true);
    try {
      const page = await fetchPortfolioPage(cursor!);
      setRows((prev) => [...prev, ...page.history.map(toRow)]);
      setCursor(page.next_cursor);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cursor, hasMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loading) loadNext(); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadNext, hasMore, loading]);

  return { rows, loading, hasMore, sentinelRef };
}

// ── useAccountStats ──────────────────────────────────────────────────────────
export function useAccountStats() {
  const [stats, setStats]     = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAccountStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { stats, loading };
}

// ── useJournal ───────────────────────────────────────────────────────────────
export function useJournal(month?: string) {
  const [journal, setJournal] = useState<JournalResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchJournal(month)
      .then(setJournal)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month]); // refetches when month changes (calendar nav)

  return { journal, loading };
}

// ── usePnLCurve ──────────────────────────────────────────────────────────────
export function usePnLCurve(period: PnLPeriod = "month") {
  const [curve, setCurve]     = useState<PnLCurveResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchPnLCurve(period)
      .then(setCurve)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period]); // refetches when the period toggle changes

  return { curve, loading };
}