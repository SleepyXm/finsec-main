"use client";
import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { validateUser, User, UserAccount } from "../handlers/auth";

export interface UserContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  account: UserAccount | null;
  setAccount: React.Dispatch<React.SetStateAction<UserAccount | null>>;
  resolved: boolean;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);

function getCachedUser(): User | null {
  try {
    const cached = localStorage.getItem("user");
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

function getCachedAccount(): UserAccount | null {
  try {
    const cached = localStorage.getItem("user_account");
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [resolved, setResolved] = useState(false);
  // check whether the inital auth check was run
  const hasInitialized = useRef(false);
  const didRun = useRef(false);

  const initAuth = async () => {
    try {
      const result = await validateUser();
      setUser(result?.user ?? null);
      setAccount(result?.account ?? null);
      if (!result) {
        localStorage.removeItem("user");
        localStorage.removeItem("user_account");
      }
    } catch {
      setUser(null);
      setAccount(null);
      localStorage.removeItem("user");
      localStorage.removeItem("user_account");
    } finally {
      setResolved(true);
    }
  };

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const authPages = ["/login", "/signup"];
    if (authPages.includes(window.location.pathname)) return;

    const cachedUser = getCachedUser();
    const cachedAccount = getCachedAccount();

    if (cachedUser && cachedAccount) {
      setUser(cachedUser);
      setAccount(cachedAccount);
      setResolved(true);
    }

    initAuth();

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) initAuth();
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, account, setAccount, resolved }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be inside UserProvider");
  return ctx;
};