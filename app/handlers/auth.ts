export const API_BASE = process.env.NEXT_PUBLIC_API_BASE2;
export const WSAPI_BASE = process.env.NEXT_PUBLIC_WS_API_BASE2;

let refreshPromise: Promise<boolean> | null = null;

export async function request(path: string, options: RequestInit, isRetry = false): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });

  const skipRefresh = ["/auth/login", "/auth/signup", "/auth/refresh", "/auth/logout"];
  if (res.status === 401 && !isRetry && !skipRefresh.some(p => path.includes(p))) {
    if (!refreshPromise) {
      refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      })
        .then((r) => r.ok)
        .finally(() => { refreshPromise = null; });
    }
    const refreshed = await refreshPromise;
    if (refreshed) return request(path, options, true);

    throw new Error("UNAUTHENTICATED");
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `Request failed with status ${res.status}`);
  return data;
}



export type User = {
    username: string;
    email: string;
};

export type UserAccount = {
  account_type: string;
  balance: string;
  currency: string;
  status: string;
};

const STALE_TIME = 5 * 60 * 1000;

export async function validateUser(): Promise<{ user: User; account: UserAccount } | null> {
  try {
    const lastCheck = localStorage.getItem("user_validated_at");
    const cachedUser = localStorage.getItem("user");
    const cachedAccount = localStorage.getItem("user_account");

    if (lastCheck && cachedUser && cachedAccount && Date.now() - Number(lastCheck) < STALE_TIME) {
      return {
        user: JSON.parse(cachedUser),
        account: JSON.parse(cachedAccount),
      };
    }

    const { user, account } = await request("/api/auth/me", { method: "GET" });
    
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("user_account", JSON.stringify(account));
    localStorage.setItem("user_validated_at", String(Date.now()));

    return { user, account };
  } catch {
    return null;
  }
}


export async function signup(username: string, email: string, password: string) {
  return request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

export async function login(email: string, password: string) {
  await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  return validateUser();
}

export async function fetchUserAccountInfo(): Promise<UserAccount | null> {
  try {
    const data = await request("/api/user/accounts", { method: "GET" });
    localStorage.setItem("user_account", JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}


export async function logout() {
  await request("/api/auth/logout", { method: "POST" });
  ["user", "user_account", "user_validated_at"].forEach(k => localStorage.removeItem(k));
}