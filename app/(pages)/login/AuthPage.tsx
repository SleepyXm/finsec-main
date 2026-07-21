"use client";

import React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signup, login } from "@/app/components/handlers/auth";
import { useUser } from "@/app/components/provider/userprovider";
import Popup from "../components/errorpopup";
import { AuthChartAnimation } from "@/app/UI/client";
import { theme, panelStyle, cornerStyle } from "@/app/UI";

export default function Auth() {
  const { setUser, setAccount } = useUser();

  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const t = theme.dark;

  const router = useRouter();

  async function handleSubmit() {
    if (submitting) return;
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = userName.trim();
    try {
      if (isSignUp) {
        if (password !== password2) {
          setError("Passwords do not match!");
          return;
        }

        if (!normalizedEmail.includes("@")) {
          setError("Please enter a valid email address.");
          return;
        }
        if (!/^[A-Za-z0-9_]{3,32}$/.test(normalizedUsername)) {
          setError("Username must be 3–32 letters, numbers, or underscores.");
          return;
        }

        setSubmitting(true);
        await signup(normalizedUsername, normalizedEmail, password);

        setSuccess("Account created! Check your email to verify.");
        setIsSignUp(false);
        setPassword("");
        setPassword2("");
        return;
      }

      setSubmitting(true);
      const res = await login(normalizedEmail, password);

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
    } finally {
      setSubmitting(false);
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
            <h1>Define your strategy, entries, exits</h1>
          </div>

          <div className="auth-visual-copy auth-visual-copy-bottom">
            <h1>And automate the chart out of your life.</h1>
          </div>
        </aside>

        <section className="auth-panel">
          <div className="auth-panel-inner anim-fade-up"
          style={{ ...panelStyle(t), padding:"1.5rem 2rem", position: "relative" }}>
            <div style={cornerStyle()} />
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
                    maxLength={32}
                  />
                )}

                <AuthField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  maxLength={254}
                />

                <AuthField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  maxLength={72}
                />

                {isSignUp && (
                  <AuthField
                    label="Confirm password"
                    type="password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    placeholder="Confirm password"
                    maxLength={72}
                  />
                )}
              </div>

              <button type="submit" className="auth-submit" disabled={submitting}>
                {submitting ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
              </button>
            </form>

            <footer className="auth-footer">
              <p>
                {isSignUp
                  ? "Already have an account?"
                  : "Don't have an account?"}{" "}
                <button
                  type="button"
                  disabled={submitting}
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
  maxLength,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  maxLength?: number;
}) {
  return (
    <div className="auth-field">
      <div className="auth-label-row">
        <label>{label}</label>
      </div>

      <input
        type={type}
        required
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
      />
    </div>
  );
}
