"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signup, login } from "@/app/handlers/auth";
import { useUser } from "@/app/provider/userprovider";
import Popup from "../components/errorpopup";
import { AuthChartAnimation } from "../components/UI/tradeanimation";

export default function Auth() {
  const { setUser, setAccount } = useUser();

  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [mounted, setMounted] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  async function handleSubmit() {
    setError("");
    setSuccess("");

    try {
      if (isSignUp) {
        if (password !== password2) {
          setError("Passwords do not match!");
          return;
        }

        if (!email.includes("@")) {
          setError("Please enter a valid email address.");
          return;
        }

        const res = await signup(userName, email, password);
        console.log("Signed up:", res.message);

        setSuccess("Account created! Check your email to verify.");
        setIsSignUp(false);
        return;
      }

      const res = await login(email, password);

      if (!res) {
        setError("Login failed. Try again.");
        return;
      }

      setUser(res.user);
      setAccount(res.account);
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";

      setError(message);
    }
  }

  return (
    <main className="auth-page">
      <Popup message={error} onClose={() => setError("")} />
      <Popup message={success} onClose={() => setSuccess("")} type="success" />

      <section className="auth-layout anim-soft-enter">
        <aside className="auth-visual">
          <AuthChartAnimation />

          <div className="auth-visual-copy auth-visual-copy-top anim-fade-up">
            <p>Finsec</p>
            <h1>Track markets, assets, and operations in one place.</h1>
          </div>

          <div className="auth-visual-copy auth-visual-copy-bottom">
            <h1>and turn your strategy to a trading bot.</h1>
          </div>
        </aside>

        <section className="auth-panel">
          <div className="auth-panel-inner anim-fade-up">
            <header className="auth-header">
              <h2>{isSignUp ? "Get Started" : "Welcome Back"}</h2>

              <p>
                {isSignUp
                  ? "Create an account to access your dashboard."
                  : "Sign in to continue to your dashboard."}
              </p>
            </header>

            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <div
                key={isSignUp ? "signup" : "login"}
                className="auth-fields anim-switch"
              >
                {isSignUp && (
                  <AuthField
                    label="Username"
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Username"
                  />
                )}

                <AuthField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />

                <AuthField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  rightSlot={
                    !isSignUp ? (
                      <a href="#" className="auth-link">
                        Forgot password?
                      </a>
                    ) : null
                  }
                />

                {isSignUp && (
                  <AuthField
                    label="Confirm password"
                    type="password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    placeholder="Confirm password"
                  />
                )}
              </div>

              {!isSignUp && (
                <label className="auth-checkbox">
                  <input type="checkbox" />
                  <span>Remember me</span>
                </label>
              )}

              <button type="submit" className="auth-submit">
                {isSignUp ? "Create account" : "Sign in"}
              </button>
            </form>

            <footer className="auth-footer">
              <p>
                {isSignUp
                  ? "Already have an account?"
                  : "Don't have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => setIsSignUp((value) => !value)}
                >
                  {isSignUp ? "Sign in" : "Sign up"}
                </button>
              </p>
            </footer>
          </div>
        </section>
      </section>
    </main>
  );
}

function AuthField({
  label,
  type,
  value,
  onChange,
  placeholder,
  rightSlot,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="auth-field">
      <div className="auth-label-row">
        <label>{label}</label>
        {rightSlot}
      </div>

      <input
        type={type}
        required
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}