import { request } from "./auth";
import { ChartTheme } from "@/app/(pages)/chart/chartrender/themes/themes";

export type CookieConsent = "accepted" | "declined";

export type ProfilePreferences = {
  color_scheme?: {
    chart?: "candlestick" | "line";
    colours?: Partial<ChartTheme>;
  };
  cookie_consent?: CookieConsent | null;
};

type SavePreferencesResponse = {
  message?: string;
};

export async function getPreferences(): Promise<ProfilePreferences | null> {
  try {
    const data = await request<ProfilePreferences>("/api/profile/preferences", { method: "GET" });
    return data;
  } catch {
    return null;
  }
}

export function saveCookieConsent(cookieConsent: CookieConsent): Promise<SavePreferencesResponse> {
  return request<SavePreferencesResponse>("/api/profile/preferences", {
    method: "PUT",
    body: JSON.stringify({ cookie_consent: cookieConsent }),
  });
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
