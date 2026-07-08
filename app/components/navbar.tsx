"use client";

import { useState, useEffect, type CSSProperties } from "react";
import { useUser } from "../provider/userprovider";
import { logout } from "../handlers/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AssetSearchBar, AssetListItem } from "@/app/assetsearch/assetsearchcomponents";
import { useAssetSearch } from "../hooks/utility";
import { usePathname } from "next/navigation";
import { cornerStyle, panelStyle, theme } from "@/app/components/UI/UI";

// ─── Constants ────────────────────────────────────────────────────────────────

const NAV_HOVER_BG     = "rgba(238,242,247,0.10)";
const NAV_ACTIVE_BG    = "rgba(238,242,247,0.07)";
const NAV_HOVER_BORDER = "rgba(238,242,247,0.26)";

function navItemStyle(active = false, cta = false): CSSProperties {
  return {
    display: "block",
    padding: "7px 14px",
    border: `1px solid ${active ? NAV_HOVER_BORDER : "transparent"}`,
    borderRadius: 0,
    background: cta ? theme.dark.accent : active ? NAV_ACTIVE_BG : "transparent",
    color: cta ? theme.dark.btnText : active ? theme.dark.text : theme.dark.muted2,
    fontSize: 12,
    fontWeight: 500,
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 150ms ease, color 150ms ease, border-color 150ms ease",
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type NavLinkDef = {
  label: string;
  url?: string;
  cta?: boolean;
  onClick?: () => void;
};

// ─── Shared NavItem ───────────────────────────────────────────────────────────

function NavItem({
  link,
  pathname,
  mobile = false,
}: {
  link: NavLinkDef;
  pathname: string;
  mobile?: boolean;
}) {
  const active = link.url ? pathname === link.url : false;
  const base = navItemStyle(active, link.cta);
  const style: CSSProperties = mobile
    ? { ...base, width: "100%", padding: "10px 12px", fontSize: 14 }
    : base;

  const onEnter = (e: React.MouseEvent<HTMLElement>) =>
    Object.assign(e.currentTarget.style, {
      background: NAV_HOVER_BG,
      borderColor: NAV_HOVER_BORDER,
      color: theme.dark.text,
    });

  const onLeave = (e: React.MouseEvent<HTMLElement>) =>
    Object.assign(e.currentTarget.style, style);

  const shared = { style, onMouseEnter: onEnter, onMouseLeave: onLeave };

  return link.url ? (
    <Link href={link.url} {...shared}>
      {link.label}
    </Link>
  ) : (
    <button
      onClick={link.onClick}
      {...shared}
      style={{ ...style, textAlign: mobile ? "left" : undefined }}
    >
      {link.label}
    </button>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

const Navbar = () => {
  const { user, setUser } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const router   = useRouter();
  const pathname = usePathname();
  const { assets, search } = useAssetSearch();

  const isChartPage = pathname.startsWith("/chart/") || pathname.startsWith("/dashboard");
  const searchOpen  = assets.length > 0;

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      setIsVisible(window.scrollY <= lastY);
      lastY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    router.push("/");
  };

  const links: NavLinkDef[] = [
    { label: "Home", url: "/" },
    ...(user
      ? [
          { label: user.username, url: "/profile" },
          { label: "Dashboard",   url: "/dashboard" },
          { label: "Marketplace", url: "/marketplace" },
          { label: "Sign out", onClick: handleLogout },
        ]
      : [{ label: "Sign in", url: "/login", cta: true }]),
  ];

  const headerClass = [
    "fixed z-50 border-b border-white/[0.09] backdrop-blur-sm transition-all",
    isChartPage
      ? "relative w-full rounded-none"
      : [
          "top-3 left-1/2 -translate-x-1/2 w-[80vw] rounded-4xl border",
          isVisible ? "translate-y-0" : "-translate-y-full",
        ].join(" "),
  ].join(" ");

  return (
    <header
      className={headerClass}
      style={{
        ...panelStyle(theme.dark),
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(180px,280px) minmax(0,1fr)",
        alignItems: "center",
        columnGap: 18,
        minHeight: 56,
        padding: "0 24px",
        overflow: "visible",
        background: "linear-gradient(180deg, rgba(19,24,33,0.88), rgba(14,17,23,0.78))",
        boxShadow: isChartPage ? "none" : "0 18px 48px rgba(0,0,0,0.22)",
      }}
    >
      <div aria-hidden="true" style={cornerStyle()} />

      {/* Logo */}
      <Link
        href="/"
        className="flex items-center no-underline"
        style={{ position: "relative", zIndex: 1, justifySelf: "start" }}
      >
        <span style={{ color: theme.dark.text, fontWeight: 500, fontSize: 24 }}>
          Finsec
        </span>
      </Link>

      {/* Search */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          justifySelf: "center",
          width: "100%",
          maxWidth: 280,
        }}
      >
        <AssetSearchBar onSearch={search} />
        {searchOpen && (
          <ul
            className="list-none p-0 m-0"
            style={{
              ...panelStyle(theme.dark),
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              borderRadius: 0,
              overflow: "hidden",
            }}
          >
            <li aria-hidden="true" style={{ ...cornerStyle(), listStyle: "none" }} />
            {assets.map((asset) => (
              <AssetListItem key={asset.symbol} asset={asset} />
            ))}
          </ul>
        )}
      </div>

      {/* Nav */}
      <nav style={{ justifySelf: "end", position: "relative", zIndex: 1 }}>
        <ul className="flex items-center gap-0.5 list-none p-0 m-0">
          {links.map((link) => (
            <li key={link.label}>
              <NavItem link={link} pathname={pathname} />
            </li>
          ))}
          <li>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
              style={navItemStyle()}
              onMouseEnter={(e) =>
                Object.assign(e.currentTarget.style, {
                  background: NAV_HOVER_BG,
                  borderColor: NAV_HOVER_BORDER,
                  color: theme.dark.text,
                })
              }
              onMouseLeave={(e) =>
                Object.assign(e.currentTarget.style, navItemStyle())
              }
            >
              ☰
            </button>
          </li>
        </ul>

        {mobileOpen && (
          <ul
            className="absolute top-full right-0 flex flex-col gap-0.5 list-none px-4 pb-3 pt-2 min-w-[160px]"
            style={{ ...panelStyle(theme.dark), borderRadius: 0, overflow: "hidden" }}
          >
            <li aria-hidden="true" style={{ ...cornerStyle(), listStyle: "none" }} />
            {links.map((link) => (
              <li key={link.label}>
                <NavItem link={link} pathname={pathname} mobile />
              </li>
            ))}
          </ul>
        )}
      </nav>
    </header>
  );
};

export default Navbar;