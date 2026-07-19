import type { ReactNode } from "react";

interface LoadingStateProps {
  message: string;
  className?: string;
}

export function LoadingState({ message, className = "" }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex h-48 flex-col items-center justify-center gap-2 bg-black/70 text-gray-300 ${className}`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none"
      />
      <span className="text-xs">{message}</span>
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  message: string;
  className?: string;
}

export function EmptyState({ icon, message, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex h-full select-none flex-col items-center justify-center gap-3 text-gray-600 ${className}`}
    >
      {icon}
      <p className="text-xs">{message}</p>
    </div>
  );
}
