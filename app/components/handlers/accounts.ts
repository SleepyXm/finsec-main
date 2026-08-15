import { request } from "./auth";
import { AccountStats, JournalResponse, PnLCurveResponse, PnLPeriod } from "../types/accounts";

export async function fetchAccountStats(): Promise<AccountStats> {
  return request<AccountStats>("/api/account/stats", { method: "GET" });
}

export async function fetchJournal(month?: string): Promise<JournalResponse> {
  // month: "YYYY-MM", defaults to current month on the server if omitted
  const query = month ? `?month=${month}` : "";
  return request<JournalResponse>(`/api/account/journal${query}`, { method: "GET" });
}

export async function fetchPnLCurve(period: PnLPeriod = "month"): Promise<PnLCurveResponse> {
  return request<PnLCurveResponse>(`/api/account/pnl-curve?period=${period}`, { method: "GET" });
}

export type Broker = "saxo" | "ig";
export type BrokerEnvironment = "demo" | "live";

export type BrokerConnection = {
  status: "connected" | "disconnected" | "reconnect_required";
  environment: BrokerEnvironment | null;
  account_id: string | null;
  connected_at: string | null;
};

export type AuthorizeBrokerRequest =
  | {
      broker: "saxo";
      environment: BrokerEnvironment;
    }
  | {
      broker: "ig";
      environment: BrokerEnvironment;
      identifier: string;
      password: string;
      api_key: string;
    };

export type AuthorizeBrokerResponse =
  | {
      status: "authorization_required";
      authorization_url: string;
    }
  | {
      status: "connected";
    };

export async function fetchBrokerConnection(broker: Broker): Promise<BrokerConnection> {
  return request<BrokerConnection>(`/api/account/broker/${broker}`, { method: "GET" });
}

export async function authorizeBroker(options: AuthorizeBrokerRequest): Promise<AuthorizeBrokerResponse> {
  const { broker, environment } = options;
  const body =
    broker === "ig"
      ? JSON.stringify({
          environment,
          identifier: options.identifier,
          password: options.password,
          api_key: options.api_key,
        })
      : undefined;

  return request<AuthorizeBrokerResponse>(
    `/api/account/broker/${broker}/authorize?environment=${environment}`,
    { method: "POST", body },
  );
}

export async function disconnectBroker(broker: Broker): Promise<void> {
  await request<void>(`/api/account/broker/${broker}`, { method: "DELETE" });
}