import { Column, Pill, PillVariant, tokens } from "@/app/dashboard/components/dashboard";
import { TradeHistoryRow } from "@/app/types/portfolio";


export const TRADE_COLUMNS: Column<TradeHistoryRow>[] = [
  { key: "symbol", label: "Symbol" },
  {
    key: "side",
    label: "Side",
    render: (v) => <Pill variant={v === "Long" ? "green" : "red" as PillVariant}>{v as string}</Pill>,
  },
  { key: "entry_price", label: "Entry" },
  { key: "exit_price",  label: "Exit"  },
  { key: "quantity",  label: "Size"  },
  {
    key: "realised_pnl",
    label: "P&L",
    render: (v) => (
      <span style={{ color: String(v).startsWith("+") ? tokens.green : tokens.red }}>
        {v as string}
      </span>
    ),
  },
  { key: "rr",   label: "R:R" },
  {
    key: "date",
    label: "Date",
    render: (v) => <span style={{ color: tokens.text3 }}>{v as string}</span>,
  },
  {
    key: "note",
    label: "Note",
    render: (v) => <span style={{ fontStyle: "italic", color: tokens.text3 }}>{v as string}</span>,
  },
];
