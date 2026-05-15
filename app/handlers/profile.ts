import { request } from "./auth";
import { ChartTheme } from "../components/chartrender/themes/themes";

export async function getPreferences() {
  try {
    const data = await request("/api/profile/preferences", { method: "GET" });
    return data;
  } catch {
    return null;
  }
}

export async function savePreferences(chart: "candlestick" | "line", colours: Partial<ChartTheme>) {
  return request("/api/profile/preferences", {
    method: "PUT",
    body: JSON.stringify({
      color_scheme: {
        chart,
        colours,
      },
    }),
  });
}