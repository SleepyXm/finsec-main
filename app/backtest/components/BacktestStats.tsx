import { BacktestSession, BacktestCandle } from "@/app/types/backend";

interface Props {
  session: BacktestSession;
  candles: BacktestCandle[];
}

export default function BacktestStats({ session, candles }: Props) {
  const latest = candles[candles.length - 1];

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        { label: "Balance",       value: `$${session.starting_balance.toLocaleString()}` },
        { label: "Candles Seen",  value: candles.length },
        { label: "Current Close", value: latest ? `$${latest.close.toFixed(2)}` : "—" },
        { label: "Current Open",  value: latest ? `$${latest.open.toFixed(2)}`  : "—" },
      ].map(({ label, value }) => (
        <div key={label} className="rounded-lg bg-zinc-800 px-3 py-2">
          <p className="text-xs text-zinc-400">{label}</p>
          <p className="text-sm font-semibold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}