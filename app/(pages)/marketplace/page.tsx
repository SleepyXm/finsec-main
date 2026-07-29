"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listUserStrategies,
  type SavedStrategy,
} from "@/app/components/handlers/annotations";
import {
  getMarketplaceStrategy,
  listMarketplaceStrategies,
  setMarketplaceVisibility,
  storeMarketplaceStrategy,
  type MarketplaceStrategy,
} from "@/app/components/handlers/marketplace";
import { useUser } from "@/app/components/provider/userprovider";

export default function MarketplacePage() {
  const router = useRouter();
  const { user, resolved } = useUser();
  const [items, setItems] = useState<MarketplaceStrategy[]>([]);
  const [saved, setSaved] = useState<SavedStrategy[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setItems(await listMarketplaceStrategies());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load strategies.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!resolved || !user) return;
    listUserStrategies()
      .then((strategies) => {
        setSaved(strategies);
        setSelected(strategies[0]?.id ?? "");
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Could not load your strategies."));
  }, [resolved, user]);

  const visible = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return items;
    return items.filter((item) =>
      [item.title, item.description, item.author]
        .some((field) => field.toLowerCase().includes(value)));
  }, [items, search]);

  const published = items.find((item) => item.id === selected);

  useEffect(() => {
    setDescription(published?.description ?? "");
  }, [published?.description, selected]);

  const apply = async (item: MarketplaceStrategy) => {
    setBusy(item.id);
    try {
      const strategy = await getMarketplaceStrategy(item.id);
      storeMarketplaceStrategy(strategy);
      router.push(`/chart/${encodeURIComponent(strategy.snapshots[0]?.symbol || "AAPL")}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not apply strategy.");
      setBusy(null);
    }
  };

  const publish = async () => {
    if (!selected) return;
    setBusy("publish");
    try {
      await setMarketplaceVisibility(selected, !published, description);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update strategy.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#0E1117] px-[5vw] pb-24 pt-28 text-[#EEF2F7]">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-white/10 pb-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#8FAADC]">
            Strategy marketplace
          </p>
          <h1 className="mt-4 text-4xl font-semibold md:text-6xl">
            Apply shared chart strategies.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/50">
            Every strategy here is free. Applying one downloads its examples into
            the browser and runs it through the existing chart engine.
          </p>
        </header>

        {error && (
          <p className="mt-6 border border-red-300/25 bg-red-300/10 p-3 text-sm text-red-200">
            {error}
          </p>
        )}

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search strategies"
          className="my-7 w-full max-w-sm border border-white/15 bg-transparent px-4 py-3 text-sm outline-none focus:border-[#8FAADC]"
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <article
              key={item.id}
              className="flex min-h-64 flex-col border border-white/10 bg-white/[0.025] p-5"
            >
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-white/40">
                <span>{item.official ? "Finsec" : item.author}</span>
                <span>Free</span>
              </div>
              <h2 className="mt-6 text-xl font-semibold">
                {item.title.replaceAll("_", " ")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/50">
                {item.description || "A strategy built from annotated chart examples."}
              </p>
              <p className="mt-auto pt-6 font-mono text-[10px] uppercase tracking-wider text-white/35">
                {item.snapshot_count} examples · {item.preview.symbol}
              </p>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void apply(item)}
                className="mt-4 border border-white/20 px-4 py-2.5 text-xs hover:border-[#8FAADC] disabled:opacity-40"
              >
                {busy === item.id ? "Loading…" : "Apply on chart"}
              </button>
            </article>
          ))}
        </section>

        {user && saved.length > 0 && (
          <section className="mt-12 border-t border-white/10 pt-8">
            <h2 className="text-xl font-semibold">Share one of yours</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
              <select
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="border border-white/15 bg-[#0E1117] px-3 py-2.5 text-sm"
              >
                {saved.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.title.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <input
                value={description}
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Short description"
                className="border border-white/15 bg-transparent px-3 py-2.5 text-sm outline-none"
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void publish()}
                className="border border-white/20 px-4 py-2.5 text-xs hover:border-[#8FAADC]"
              >
                {busy === "publish"
                  ? "Saving…"
                  : published
                    ? "Unpublish"
                    : "Publish"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
