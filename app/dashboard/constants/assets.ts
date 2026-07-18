import { tokens } from "@/app/dashboard/components/dashboard";

export interface DashboardAsset {
  init: string;
  symbol: string;
  name: string;
  price: string;
  change: string;
  up: boolean;
  bg: string;
  color: string;
}

export const ASSETS: DashboardAsset[] = [
  { init: "NV", symbol: "NVDA", name: "Nvidia Corp",  price: "$847.20", change: "+2.14%", up: true,  bg: tokens.blueDim,          color: tokens.blue  },
  { init: "AP", symbol: "AAPL", name: "Apple Inc",    price: "$190.05", change: "+1.52%", up: true,  bg: tokens.greenDim,         color: tokens.green },
  { init: "TS", symbol: "TSLA", name: "Tesla Inc",    price: "$172.40", change: "-1.88%", up: false, bg: tokens.redDim,           color: tokens.red   },
  { init: "SP", symbol: "SPY",  name: "S&P 500 ETF",  price: "$523.11", change: "+0.43%", up: true,  bg: "rgba(251,191,36,0.10)", color: "#fbbf24"    },
];
