// app/auth/page.tsx
import type { Metadata } from "next";
import Auth from "./AuthPage"; // your existing component

export const metadata: Metadata = {
  title: "FinSec - Sign In",
};

export default function AuthPage() {
  return <Auth />;
}