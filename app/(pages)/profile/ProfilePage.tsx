"use client";
import { logout } from "@/app/components/handlers/auth";
import { authorizeBroker, disconnectBroker, fetchBrokerConnection, type BrokerConnection, type BrokerEnvironment } from "@/app/components/handlers/accounts";
import { useEffect, useState } from "react";
import { useUser } from "@/app/components/provider/userprovider";
import { useRouter } from "next/navigation";
import { EmptyState, LoadingState } from "@/app/UI";
import { InfoRow, SidebarTab, TabSection, UserAvatar, SidebarActions, SectionDivider, ConnectionCard } from "./profilecomponents";
import { SubscriptionSection } from "./SubscriptionSection";

const TABS = ["account", "subscription", "trading account", "connections", "bots", "sessions", "personalization"] as const;
type ProfileTab = (typeof TABS)[number];

function cleanAccountValue(value?: string) {
  const trimmed = value?.trim() ?? "";
  const quote = trimmed[0];
  return trimmed.length > 1 && (quote === "'" || quote === '"') && trimmed.at(-1) === quote
    ? trimmed.slice(1, -1).trim()
    : trimmed;
}

function displayAccountValue(value?: string) {
  const cleaned = cleanAccountValue(value);
  return cleaned
    ? cleaned.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "—";
}

function displayBalance(balance?: string, currencyValue?: string) {
  const amount = Number(cleanAccountValue(balance));
  const currency = cleanAccountValue(currencyValue).toUpperCase();
  if (!Number.isFinite(amount)) return "—";

  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)}${currency ? ` ${currency}` : ""}`;
  }
}

export default function Profile() {
  const [activeTab, setActiveTab] = useState<ProfileTab>("account");
  const [saxo, setSaxo] = useState<BrokerConnection | null>(null);
  const [ig, setIg] = useState<BrokerConnection | null>(null);
  const [saxoEnvironment, setSaxoEnvironment] = useState<BrokerEnvironment>("demo");
  const [igEnvironment, setIgEnvironment] = useState<BrokerEnvironment>("demo");
  const [saxoError, setSaxoError] = useState<string | null>(null);
  const [igError, setIgError] = useState<string | null>(null);
  const [saxoLoading, setSaxoLoading] = useState(false);
  const [igLoading, setIgLoading] = useState(false);
  const [igIdentifier, setIgIdentifier] = useState("");
  const [igPassword, setIgPassword] = useState("");
  const [igAPIKey, setIgAPIKey] = useState("");
  const { user, account, resolved, setUser, setAccount } = useUser();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    const broker = params.get("broker");
    if (TABS.includes(requestedTab as ProfileTab)) setActiveTab(requestedTab as ProfileTab);
    if (broker === "saxo" && params.get("status") === "error") {
      setSaxoError("Saxo authorization was not completed.");
    }
    if (broker === "ig" && params.get("status") === "error") {
      setIgError("IG authorization was not completed.");
    }
  }, []);

  useEffect(() => {
    if (resolved && !user) router.replace("/login");
  }, [resolved, router, user]);

  useEffect(() => {
    if (!user || activeTab !== "connections") return;

    setSaxoLoading(true);
    fetchBrokerConnection("saxo")
      .then((connection) => {
        setSaxo(connection);
        if (connection.environment) setSaxoEnvironment(connection.environment);
        setSaxoError(null);
      })
      .catch((error) => setSaxoError(error instanceof Error ? error.message : "Could not load Saxo connection."))
      .finally(() => setSaxoLoading(false));

    setIgLoading(true);
    fetchBrokerConnection("ig")
      .then((connection) => {
        setIg(connection);
        if (connection.environment) setIgEnvironment(connection.environment);
        setIgError(null);
      })
      .catch((error) => setIgError(error instanceof Error ? error.message : "Could not load IG connection."))
      .finally(() => setIgLoading(false));
  }, [activeTab, user]);

  if (!user) {
    return (
      <LoadingState
        message={resolved ? "Redirecting to sign in…" : "Loading profile…"}
        className="!h-screen !bg-[#0E1117]"
      />
    );
  }

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setAccount(null);
    router.push("/login");
  };

  const handleSaxoConnect = async () => {
    setSaxoLoading(true);
    setSaxoError(null);
    try {
      const result = await authorizeBroker({ broker: "saxo", environment: saxoEnvironment });
      if (result.status === "authorization_required") {
        window.location.assign(result.authorization_url);
        return;
      }
      setSaxo(await fetchBrokerConnection("saxo"));
    } catch (error) {
      setSaxoError(error instanceof Error ? error.message : "Could not start Saxo authorization.");
    } finally {
      setSaxoLoading(false);
    }
  };

  const handleSaxoDisconnect = async () => {
    setSaxoLoading(true);
    setSaxoError(null);
    try {
      await disconnectBroker("saxo");
      setSaxo({
        status: "disconnected", environment: null, account_id: null, connected_at: null,
      });
    } catch (error) {
      setSaxoError(error instanceof Error ? error.message : "Could not disconnect Saxo.");
    } finally {
      setSaxoLoading(false);
    }
  };

  const handleIGConnect = async () => {
    if (!igIdentifier.trim() || !igPassword || !igAPIKey.trim()) {
      setIgError("IG identifier, password, and API key are required.");
      return;
    }

    setIgLoading(true);
    setIgError(null);
    try {
      const result = await authorizeBroker({
        broker: "ig", environment: igEnvironment,
        identifier: igIdentifier.trim(), password: igPassword, api_key: igAPIKey.trim(),
      });
      if (result.status === "authorization_required") {
        window.location.assign(result.authorization_url);
        return;
      }

      setIg(await fetchBrokerConnection("ig"));
      setSaxo({
        status: "disconnected", environment: null, account_id: null, connected_at: null,
      });
      setIgIdentifier("");
      setIgPassword("");
      setIgAPIKey("");
    } catch (error) {
      setIgError(error instanceof Error ? error.message : "Could not connect IG.");
    } finally {
      setIgLoading(false);
    }
  };

  const handleIGDisconnect = async () => {
    setIgLoading(true);
    setIgError(null);
    try {
      await disconnectBroker("ig");
      setIg({
        status: "disconnected", environment: null, account_id: null, connected_at: null,
      });
    } catch (error) {
      setIgError(error instanceof Error ? error.message : "Could not disconnect IG.");
    } finally {
      setIgLoading(false);
    }
  };

  const sessions: Array<{ device: string; location: string }> = [];

  return (
    <div className="min-h-screen flex justify-center items-start py-26 relative text-black dark:text-zinc-200 bg-[radial-gradient(circle_at_15%_10%,rgba(143,170,220,0.10),transparent_28%),linear-gradient(180deg,#0E1117_0%,#131821_45%,#0E1117_100%)]">
      <div className="w-[85vw] h-[85vh] rounded-lg backdrop-blur-lg bg-black/20 border border-white/40 dark:border-white/9 p-6 shadow-2xl flex gap-6">

        {/* Sidebar */}
        <div className="w-48 flex flex-col items-center border-r border-black/20 dark:border-white/10 pr-4 gap-6">
          <UserAvatar username={user.username} />
          <div className="flex flex-col w-full gap-2">
            {TABS.map((tab) => (
              <SidebarTab
                key={tab}
                label={tab.charAt(0).toUpperCase() + tab.slice(1)}
                active={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              />
            ))}
          </div>
          <SidebarActions onLogout={() => void handleLogout()} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex flex-col gap-4">

          {activeTab === "account" && (
            <TabSection title="Account Information" subtitle="Your personal details and credentials.">
              <InfoRow label="Username" value={user.username} />
              <InfoRow label="Email" value={user.email ?? "No email on file"} />
              <InfoRow label="Password" value="••••••••" />
              <InfoRow label="Subscription" value={user.subscription_tier ?? "Free"} action={() => setActiveTab("subscription")} actionLabel="Manage" />
              <SectionDivider label="Danger Zone" />
              <InfoRow label="Delete Account" value="Account deletion is not available yet." />
            </TabSection>
          )}

          {activeTab === "subscription" && <SubscriptionSection />}

          {activeTab === "trading account" && (
            <TabSection title="Trading Account" subtitle="Your paper trading balance and account details.">
              <InfoRow label="Account Type" value={displayAccountValue(account?.account_type)} />
              <InfoRow label="Balance" value={displayBalance(account?.balance, account?.currency)} />
              <InfoRow label="Status" value={displayAccountValue(account?.status)} />
            </TabSection>
          )}

          {activeTab === "connections" && (
            <TabSection title="Connections" subtitle="Link your broker and trading services.">
              <SectionDivider label="Saxo" />
              {saxo?.status !== "connected" && (
                <InfoRow label="Environment">
                  <select
                    value={saxoEnvironment}
                    onChange={(event) => setSaxoEnvironment(event.target.value as BrokerEnvironment)}
                    disabled={saxoLoading}
                    className="rounded-md border border-white/20 bg-[#131821] px-3 py-1 text-sm text-zinc-200"
                  >
                    <option value="demo">Demo</option>
                    <option value="live">Live</option>
                  </select>
                </InfoRow>
              )}
              <ConnectionCard
                name="Saxo"
                connected={saxo?.status === "connected"}
                onConnect={saxoLoading ? undefined : () => void handleSaxoConnect()}
                onDisconnect={saxoLoading ? undefined : () => void handleSaxoDisconnect()}
              />
              {saxo?.account_id && <InfoRow label="Account" value={saxo.account_id} />}
              {saxo?.status === "reconnect_required" && (
                <InfoRow label="Session" value="Authorization expired. Reconnect to continue." />
              )}
              {saxoLoading && <InfoRow label="Saxo" value="Checking connection…" />}
              {saxoError && <InfoRow label="Saxo error" value={saxoError} />}

              <SectionDivider label="IG" />
              {ig?.status !== "connected" && (
                <>
                  <InfoRow label="Environment">
                    <select
                      value={igEnvironment}
                      onChange={(event) => setIgEnvironment(event.target.value as BrokerEnvironment)}
                      disabled={igLoading}
                      className="rounded-md border border-white/20 bg-[#131821] px-3 py-1 text-sm text-zinc-200"
                    >
                      <option value="demo">Demo</option>
                      <option value="live">Live</option>
                    </select>
                  </InfoRow>
                  <InfoRow label="Identifier">
                    <input
                      value={igIdentifier}
                      onChange={(event) => setIgIdentifier(event.target.value)}
                      disabled={igLoading}
                      autoComplete="username"
                      className="rounded-md border border-white/20 bg-[#131821] px-3 py-1 text-sm text-zinc-200"
                    />
                  </InfoRow>
                  <InfoRow label="Password">
                    <input
                      type="password"
                      value={igPassword}
                      onChange={(event) => setIgPassword(event.target.value)}
                      disabled={igLoading}
                      autoComplete="current-password"
                      className="rounded-md border border-white/20 bg-[#131821] px-3 py-1 text-sm text-zinc-200"
                    />
                  </InfoRow>
                  <InfoRow label="API key">
                    <input
                      type="password"
                      value={igAPIKey}
                      onChange={(event) => setIgAPIKey(event.target.value)}
                      disabled={igLoading}
                      autoComplete="off"
                      className="rounded-md border border-white/20 bg-[#131821] px-3 py-1 text-sm text-zinc-200"
                    />
                  </InfoRow>
                </>
              )}
              <ConnectionCard
                name="IG"
                connected={ig?.status === "connected"}
                onConnect={igLoading ? undefined : () => void handleIGConnect()}
                onDisconnect={igLoading ? undefined : () => void handleIGDisconnect()}
              />
              {ig?.account_id && <InfoRow label="Account" value={ig.account_id} />}
              {ig?.status === "reconnect_required" && (
                <InfoRow label="Session" value="Authorization expired. Reconnect to continue." />
              )}
              {igLoading && <InfoRow label="IG" value="Checking connection…" />}
              {igError && <InfoRow label="IG error" value={igError} />}
            </TabSection>
          )}

          {activeTab === "bots" && (
            <TabSection title="Your Bots" subtitle="Bots you've created or deployed.">
              <EmptyState
                icon={<span aria-hidden="true" className="text-xl">◇</span>}
                message="No bots yet. Build one from a strategy to get started."
                className="min-h-48 rounded-lg border-2 border-dashed border-white/10"
              />
            </TabSection>
          )}

          {activeTab === "sessions" && (
            <TabSection title="Active Sessions" subtitle="Devices currently signed in to your account.">
              {sessions.length === 0 ? (
                <EmptyState
                  icon={<span aria-hidden="true" className="text-xl">—</span>}
                  message="No active sessions found."
                  className="min-h-48 rounded-lg border-2 border-dashed border-white/10"
                />
              ) : (
                sessions.map((s, i) => (
                  <InfoRow key={i} label={s.device} value={s.location} action={() => {}} actionLabel="Revoke" actionVariant="danger" />
                ))
              )}
            </TabSection>
          )}

          {activeTab === "personalization" && (
            <TabSection title="Personalization" subtitle="Customize your experience.">
              <InfoRow label="Theme" value="System Default" />
            </TabSection>
          )}

        </div>
      </div>
    </div>
  );
}