"use client";
import { useState, useEffect } from "react";
import { useUser } from "../provider/userprovider";
import { logout } from "../handlers/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AssetSearchBar, AssetListItem  } from "@/app/assetsearch/assetsearchcomponents";
import { useAssetSearch } from "../hooks/utility";
import { usePathname } from "next/navigation";
 
const Navbar = () => {
  const { user, setUser } = useUser();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const { assets, loading, error, search } = useAssetSearch();
  const [isVisible, setIsVisible] = useState(true);
  const pathname = usePathname();
  const isChartPage = pathname.startsWith("/chart/"); 
 
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      if (window.scrollY > lastScrollY) {
        setIsVisible(false); 
      } else {
        setIsVisible(true);
      }
      lastScrollY = window.scrollY;
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

 
  const handleLogout = async () => {
    await logout();
    setUser(null);
    router.push("/");
  };
 
  const links = [
    { label: "Home", url: "/" },
    ...(user
      ? [
          { label: user.username, url: "/profile" },
          { label: "Dashboard", url: "/dashboard" },
          { label: "Marketplace", url: "/marketplace" },
          { label: "Sign out", onClick: handleLogout },
        ]
      : [{ label: "Sign in", url: "/login", cta: true }]),
  ];

  if (!mounted) return null;
 
  return (
    <>
    <header className={`fixed top-0 left-0 z-50 flex items-center justify-between px-6 py-[12px] border-b border-white/[0.09] backdrop-blur-sm bg-white/[0.055] transition-all
      ${isChartPage ? "relative w-full rounded-none border-b"
        : `top-3 left-1/2 -translate-x-1/2 w-[80vw] rounded-4xl border ${isVisible ? "translate-y-0" : "-translate-y-full"}`
      }
    `}>
 
      {/* Logo */}
      <Link href="/" className="flex items-center no-underline">
          <span className="text-2xl font-thin tracking-[-0.4px] text-[#f0f0f0] whitespace-nowrap">
          Finsec
          </span>
      </Link>

      <div className="relative w-[280px] z-30">
        <AssetSearchBar onSearch={search} />
        {assets.length > 0 && (
          <ul className="absolute top-full mt-1 left-0 w-full bg-[#131722] border border-[#2a2e3a] rounded-xl shadow-xl overflow-hidden list-none p-0 m-0">
            {assets.map((asset) => (
              <AssetListItem
                key={asset.symbol}
                asset={asset}
              />
            ))}
          </ul>
        )}
      </div>
 
      {/* Desktop links */}
      <nav className="hidden md:block">
        <ul className="flex items-center gap-0.5 list-none">
          {links.map((link) => (
            <li key={link.label}>
              {link.url ? (
                <Link
                  href={link.url}
                  className={
                    link.cta
                      ? // Sign in — accent pill
                        "block px-4 py-[7px] rounded-[1px] text-xs font-medium no-underline transition-all duration-150 active:scale-[0.97] bg-[#3d9eff20] hover:brightness-110"
                      : // Regular link — ghost pill
                        "block px-4 py-[7px] rounded-[1px] text-xs font-medium no-underline text-white/45 hover:bg-[#3d9eff20] transition-all duration-150"
                  }
                >
                  {link.label}
                </Link>
              ) : (
                <button
                  onClick={link.onClick}
                  className="block px-4 py-[7px] rounded-[1px] text-xs font-medium bg-transparent border-none cursor-pointer text-white/45 hover:bg-[#3d9eff20] transition-all duration-150"
                >
                  {link.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>
 
      {/* Mobile toggle */}
      <button
        className="md:hidden flex items-center justify-center w-[38px] h-[38px] rounded-[10px] border-none cursor-pointer bg-white/20 dark:bg-white/[0.055] backdrop-blur-md text-black dark:text-[#f0f0f0] hover:bg-white/40 dark:hover:bg-white/[0.09] transition-all duration-150"
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-label="Toggle menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
 
      {/* Mobile menu */}
      {mobileOpen && (
        <ul className="absolute top-full left-0 right-0 flex flex-col gap-0.5 list-none bg-white/20 dark:bg-white/[0.055] backdrop-blur-2xl border-b border-white/40 dark:border-white/[0.09] px-4 pb-3 pt-2 md:hidden">
          {links.map((link) => (
            <li key={link.label}>
              {link.url ? (
                <Link
                  href={link.url}
                  className="block w-full px-[14px] py-[10px] rounded-[10px] text-sm font-medium no-underline text-white/45 hover:bg-white/40 dark:hover:bg-white/[0.09] hover:text-black dark:hover:text-[#f0f0f0] transition-all duration-150"
                >
                  {link.label}
                </Link>
              ) : (
                <button
                  onClick={link.onClick}
                  className="block w-full text-left px-[14px] py-[10px] rounded-[10px] text-sm font-medium bg-transparent border-none cursor-pointer text-white/45 hover:bg-white/40 dark:hover:bg-white/[0.09] hover:text-black dark:hover:text-[#f0f0f0] transition-all duration-150"
                >
                  {link.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </header>
    </>
  );
};
 
export default Navbar;