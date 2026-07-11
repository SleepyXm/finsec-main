import type { Metadata } from "next";
import ChartPage from "./ChartPage";

export async function generateMetadata(
  { params }: { params: { symbol: string } }
): Promise<Metadata> {
  return {
    title: `FinSec - ${params.symbol}`,
  };
}

export default ChartPage;