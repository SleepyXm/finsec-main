"use client";

import { usePathname } from "next/navigation";
import Navbar from "./navbar";

export default function NavGate() {
  const pathname = usePathname();

  const hideNav = pathname === "/login";

  if (hideNav) return null;

  return <Navbar />;
}