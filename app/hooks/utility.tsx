import { useState, useEffect } from 'react';
import { fetchAssets } from '../types/assets';
import { Asset } from '../types/assets';
import { RawData } from '../types/charts';

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebounced(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}


export function useAssetSearch() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(query: string) {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const results = await fetchAssets(query);
      setAssets(results);

      const entries = await Promise.all(
        results.map(async (asset) => {
          return [asset.symbol] as const;
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return { assets, loading, error, search };
}