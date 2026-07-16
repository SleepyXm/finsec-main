import { Metadata } from "next";
import ChartPage from "./ChartPage";

export async function generateMetadata(
  { params }: { params: Promise<{ symbol: string }> }
): Promise<Metadata> {
  const { symbol } = await params;

  return {
    title: `FinSec - ${decodeURIComponent(symbol)}`,
  };
}

export default ChartPage;
