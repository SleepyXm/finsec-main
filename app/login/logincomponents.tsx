export function AuthInput({ label, type, placeholder, value, onChange, extra }: {
  label: string
  type: string
  placeholder: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  extra?: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-gray-300 mb-1.5">{label}</label>
        {extra}
      </div>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <input
          type={type}
          required
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50 transition-all duration-300"
        />
      </div>
    </div>
  )
}

export function AuthDivider() {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-white/10"></div>
      </div>
      <div className="relative flex justify-center">
        <span className="bg-transparent px-2 text-[10px] uppercase tracking-wide text-gray-500">or</span>
      </div>
    </div>
  )
}

export function AuthFooter({ isSignUp, onToggle }: { isSignUp: boolean; onToggle: () => void }) {
  return (
    <div className="mt-8 text-xs text-gray-500">
      <div className="flex items-center justify-between">
        <p>
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button onClick={onToggle} className="text-gray-300 hover:text-teal-300">
            {isSignUp ? "Log In" : "Sign Up"}
          </button>
        </p>
        <div className="flex items-center gap-3">
          <a href="#" className="hover:text-white transition">Terms</a>
          <span className="text-gray-600">•</span>
          <a href="#" className="hover:text-white transition">Privacy</a>
        </div>
      </div>
    </div>
  )
}

export function GithubButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-300 bg-gray-800/60 ring-1 ring-gray-600/30 hover:bg-gray-700/60 hover:text-white hover:ring-gray-500/40 transition-all duration-300 focus:outline-none"
    >
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" stroke="none">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path>
      </svg>
      Log in with Github
    </button>
  )
}