
import { useAssetSearch } from "../hooks/utility";
import { AssetSearchBar, AssetListItem } from "./assetsearchcomponents";

export default function AssetSearchPage() {
  const { assets, intradayCharts, loading, error, search } = useAssetSearch();

  return (
    <div className="p-8 font-sans">
      <h2 className="mb-4 text-2xl font-semibold">Search Assets</h2>

      <AssetSearchBar onSearch={search} />

      {loading && <p className="text-gray-400 mb-4">Loading...</p>}
      {error && <p className="text-red-500 mb-4">{error}</p>}

      <ul className="list-none p-0 m-0">
        {assets.map((asset) => (
          <AssetListItem
            key={asset.symbol}
            asset={asset}
            chartData={intradayCharts[asset.symbol] ?? []}
          />
        ))}
      </ul>
    </div>
  );
}