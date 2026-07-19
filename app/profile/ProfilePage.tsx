"use client";
import { logout } from "@/app/handlers/auth";
import { useEffect, useState } from "react";
import { useUser } from "@/app/provider/userprovider";
import { useRouter } from "next/navigation";
import { EmptyState, LoadingState } from "@/app/ui";
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
  const { user, account, resolved, setUser, setAccount } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (resolved && !user) router.replace("/login");
  }, [resolved, router, user]);

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
              <ConnectionCard
                name="Broker"
                connected={false}
                onConnect={() => {}}
                onDisconnect={() => {}}
                comingSoon
              />
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
