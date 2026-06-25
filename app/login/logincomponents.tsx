import type React from "react";

export function AuthInput({
  label,
  type,
  placeholder,
  value,
  onChange,
  extra,
}: {
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-neutral-700">
          {label}
        </label>

        {extra}
      </div>

      <input
        type={type}
        required
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition duration-150 hover:border-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
      />
    </div>
  );
}

export function AuthFooter({
  isSignUp,
  onToggle,
}: {
  isSignUp: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-6 border-t border-neutral-200 pt-5">
      <div className="flex items-center justify-between gap-4 text-sm text-neutral-500">
        <p>
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={onToggle}
            className="font-medium text-neutral-900 transition-colors duration-150 hover:text-neutral-600"
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>

        <div className="hidden items-center gap-3 text-xs sm:flex">
          <a href="#" className="transition-colors duration-150 hover:text-neutral-900">
            Terms
          </a>
          <a href="#" className="transition-colors duration-150 hover:text-neutral-900">
            Privacy
          </a>
        </div>
      </div>
    </div>
  );
}