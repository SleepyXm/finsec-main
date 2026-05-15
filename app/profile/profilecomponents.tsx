import { ReactNode } from "react";
import { useRouter } from "next/navigation";

export function SidebarTab({ label, active, onClick,}:
  { label: string; active: boolean; onClick: () => void;}) 
  {
  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-2 text-left rounded-md text-sm transition-all duration-200 ${
        active
          ? "text-zinc-200 font-semibold dark:text-zinc-200 bg-zinc-100/40 dark:bg-white/10"
          : "text-zinc-100/80 dark:text-zinc-600 hover:bg-zinc-200/20 hover:text-white dark:hover:bg-white/10 dark:hover:text-zinc-100"
      }`}
    >
      {label}
    </button>
  );
}
 
export function InfoRow({ label, value, action, actionLabel, actionVariant = "default", children,}:
  { label: string; value?: string; action?: () => void; actionLabel?: string; actionVariant?: "default" | "danger";
    children?: ReactNode; }) 
    {
  return (
    <div className="flex items-center justify-between border-2 border-black dark:border-white/20 rounded-lg p-3 gap-4">
      <span className="font-medium text-sm shrink-0">{label}</span>
      <div className="flex items-center gap-3 ml-auto">
        {children ? (
          children
        ) : (
          <span className="text-sm text-black/60 dark:text-zinc-400">
            {value}
          </span>
        )}
        {action && actionLabel && (
          <button
            onClick={action}
            className={`text-xs px-3 py-1 rounded-md border transition-all duration-200 shrink-0 ${
              actionVariant === "danger"
                ? "border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                : "border-black/30 dark:border-white/20 text-black/60 dark:text-zinc-400 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white"
            }`}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
 
export function TabSection({ title, subtitle, children,}:
  { title: string; subtitle?: string; children: ReactNode; }) 
  {
  return (
    <>
      <div className="mt-6 mb-1">
        <h2 className="text-2xl font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-sm text-black/40 dark:text-zinc-500 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3 mt-3">{children}</div>
    </>
  );
}
 
export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mt-4 mb-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-black/30 dark:text-zinc-600">
        {label}
      </span>
      <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
    </div>
  );
}
 
export function ConnectionCard({ name, icon, connected, connectedAs, onConnect, onDisconnect, comingSoon,}: 
  { name: string; icon: ReactNode; connected?: boolean;
    connectedAs?: string; onConnect?: () => void; onDisconnect?: () => void; comingSoon?: boolean; })
    {
  return (
    <div
      className={`flex items-center justify-between border-2 rounded-lg p-3 transition-all duration-200 ${
        comingSoon
          ? "border-black/10 dark:border-white/5 opacity-40"
          : "border-black dark:border-white/20"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center text-black dark:text-zinc-300">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium">{name}</p>
          {connected && connectedAs && (
            <p className="text-xs text-black/40 dark:text-zinc-500">
              @{connectedAs}
            </p>
          )}
          {comingSoon && (
            <p className="text-xs text-black/40 dark:text-zinc-600">
              Coming soon
            </p>
          )}
        </div>
      </div>
      {!comingSoon && (
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Connected
              </span>
              {onDisconnect && (
                <button
                  onClick={onDisconnect}
                  className="text-xs px-3 py-1 rounded-md border border-red-400 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-200"
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <button
              onClick={onConnect}
              className="text-xs px-3 py-1 rounded-md border-2 border-black dark:border-white/30 text-black dark:text-zinc-300 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all duration-200"
            >
              Connect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
 
export function ProjectCard({ name, repo, stack, lastActive,}:
  { name: string; repo?: string; stack?: string[]; lastActive?: string; })
  {
  return (
    <div className="flex items-center justify-between border-2 border-black dark:border-white/20 rounded-lg p-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{name}</span>
        {repo && (
          <span className="text-xs text-black/40 dark:text-zinc-500">
            {repo}
          </span>
        )}
        {stack && stack.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {stack.map((s) => (
              <span
                key={s}
                className="text-[10px] px-2 py-0.5 rounded border border-black/20 dark:border-white/10 text-black/50 dark:text-zinc-500"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
      {lastActive && (
        <span className="text-xs text-black/30 dark:text-zinc-600 shrink-0">
          {lastActive}
        </span>
      )}
    </div>
  );
}


export function AuthorisationsCard({ name, full_name, private: isPrivate, default_branch, updated_at, url}:
  { name: string; full_name: string; private: boolean; default_branch: string; updated_at: string; url: string; }) {
    const router = useRouter();
  return (
    <div className="flex items-center justify-between border-2 border-black dark:border-white/20 rounded-lg p-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-xs text-black/40 dark:text-zinc-500">{full_name}</span>
        <div className="flex gap-1 mt-1">
          <span className="text-[10px] px-2 py-0.5 rounded border border-black/20 dark:border-white/10 text-black/50 dark:text-zinc-500">
            {isPrivate ? "Private" : "Public"}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-black/20 dark:border-white/10 text-black/50 dark:text-zinc-500">
            {default_branch}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-black/30 dark:text-zinc-600">{updated_at}</span>
        <button onClick={() => router.push(`/dashboard/projects?modal=import&repo=${full_name}&url=${url}`)}
          className="text-xs px-3 py-1 rounded-md border-2 border-black dark:border-white/20 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all duration-200"
        >
          Import
        </button>
      </div>
    </div>
  );
}
 
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center border-2 border-dashed border-black/20 dark:border-white/10 rounded-lg p-8 text-sm text-black/30 dark:text-zinc-600">
      {message}
    </div>
  );
}
 
export function UserAvatar({ username }: { username: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/10 border-2 border-black/20 dark:border-white/10 flex items-center justify-center text-xl font-semibold text-black dark:text-zinc-200">
        {username ? username[0].toUpperCase() : "?"}
      </div>
      <div className="text-black dark:text-zinc-300 text-sm mt-2 font-medium">
        {username}
      </div>
    </div>
  );
}
 
export function SidebarActions({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex flex-col gap-2 mt-auto w-full">
      <a
        href="/settings"
        className="w-full px-3 py-2 rounded-lg bg-white/5 text-black border border-black/20 dark:border-white/10 text-center dark:text-zinc-200 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200"
      >
        Settings
      </a>
      <button
        onClick={onLogout}
        className="w-full px-3 py-2 border-2 border-black dark:border-red-500/50 bg-red-500 hover:bg-red-400 transition-all duration-200 text-white text-sm rounded-md"
      >
        Log out
      </button>
    </div>
  );
}