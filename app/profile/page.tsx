"use client";
import { logout } from "@/app/handlers/auth";
import { useState } from "react";
import { useUser } from "@/app/provider/userprovider";
import { InfoRow, SidebarTab, TabSection, UserAvatar, SidebarActions, SectionDivider, ConnectionCard, EmptyState } from "./profilecomponents";

export default function Profile() {
  const [activeTab, setActiveTab] = useState("account");
  const { user, account } = useUser();

  if (!user) return null;

  const sessions: any[] = [];

  return (
    <div className="min-h-screen flex justify-center items-start py-8 relative text-black dark:text-zinc-200">
      <div className="w-[85vw] h-[85vh] rounded-[8px] bg-white/20 dark:bg-white/[0.055] backdrop-blur-2xl border border-white/40 dark:border-white/[0.09] p-6 shadow-2xl flex gap-6">

        {/* Sidebar */}
        <div className="w-48 flex flex-col items-center border-r border-black/20 dark:border-white/10 pr-4 gap-6">
          <UserAvatar username={user.username} />
          <div className="flex flex-col w-full gap-2">
            {["account", "trading account", "connections", "bots", "sessions", "personalization"].map((tab) => (
              <SidebarTab
                key={tab}
                label={tab.charAt(0).toUpperCase() + tab.slice(1)}
                active={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              />
            ))}
          </div>
          <SidebarActions onLogout={logout} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex flex-col gap-4">

          {activeTab === "account" && (
            <TabSection title="Account Information" subtitle="Your personal details and credentials.">
              <InfoRow label="Username" value={user.username} />
              <InfoRow label="Email" value={user.email ?? "No email on file"} action={() => {}} actionLabel="Change" />
              <InfoRow label="Password" value="••••••••" action={() => {}} actionLabel="Change" />
              <SectionDivider label="Danger Zone" />
              <InfoRow label="Delete Account" value="Permanently remove your account and all data." action={() => {}} actionLabel="Delete" actionVariant="danger" />
            </TabSection>
          )}

          {activeTab === "trading account" && (
            <TabSection title="Trading Account" subtitle="Your paper trading balance and account details.">
              <InfoRow label="Account Type" value={account?.account_type ?? "—"} />
              <InfoRow label="Balance" value={account ? `$${parseFloat(account.balance).toFixed(2)} ${account.currency}` : "—"} />
              <InfoRow label="Status" value={account?.status ?? "—"} />
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
              <EmptyState message="No bots yet. Build one from a strategy to get started." />
            </TabSection>
          )}

          {activeTab === "sessions" && (
            <TabSection title="Active Sessions" subtitle="Devices currently signed in to your account.">
              {sessions.length === 0 ? (
                <EmptyState message="No active sessions found." />
              ) : (
                sessions.map((s, i) => (
                  <InfoRow key={i} label={s.device} value={s.location} action={() => {}} actionLabel="Revoke" actionVariant="danger" />
                ))
              )}
            </TabSection>
          )}

          {activeTab === "personalization" && (
            <TabSection title="Personalization" subtitle="Customize your experience.">
              <InfoRow label="Theme" value="System Default" action={() => {}} actionLabel="Change" />
            </TabSection>
          )}

        </div>
      </div>
    </div>
  );
}