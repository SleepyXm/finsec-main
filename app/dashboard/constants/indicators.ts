import { tokens } from "@/app/dashboard/components/dashboard";

export interface Indicator {
  label: string;
  value: number;
  color: string;
}

export const INDICATORS: Indicator[] = [
  { label: "EMA 9", value: 92, color: tokens.accent  },
  { label: "VWAP",  value: 78, color: "#7950f2"      },
  { label: "RSI",   value: 61, color: "#1098ad"      },
  { label: "BB",    value: 44, color: "#0ca678"      },
  { label: "MACD",  value: 38, color: "#e8590c"      },
  { label: "ATR",   value: 22, color: "#d6336c"      },
];