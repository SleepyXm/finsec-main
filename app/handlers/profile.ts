import { request } from "./auth";
import { ChartTheme } from "../chart/chartrender/themes/themes";

type ChartPreferences = {
  color_scheme?: {
    chart?: "candlestick" | "line";
    colours?: Partial<ChartTheme>;
  };
};

type SavePreferencesResponse = {
  message?: string;
};

export async function getPreferences(): Promise<ChartPreferences | null> {
  try {
    const data = await request<ChartPreferences>("/api/profile/preferences", { method: "GET" });
    return data;
  } catch {
    return null;
  }
}

export async function savePreferences(
  chart: "candlestick" | "line",
  colours: Partial<ChartTheme>,
): Promise<SavePreferencesResponse> {
  return request<SavePreferencesResponse>("/api/profile/preferences", {
    method: "PUT",
    body: JSON.stringify({
      color_scheme: {
        chart,
        colours,
      },
    }),
  });
}
