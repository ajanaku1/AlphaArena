"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { WalletConnect } from "@/components/wallet-connect";
import { RouteTransition } from "@/components/route-transition";
import { Toaster } from "sonner";

function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current) {
        ref.current.style.left = e.clientX + "px";
        ref.current.style.top = e.clientY + "px";
      }
    };
    document.addEventListener("mousemove", handler);
    return () => document.removeEventListener("mousemove", handler);
  }, []);

  return <div ref={ref} className="cursor-glow hidden md:block" />;
}

const NAV_ITEMS = [
  { href: "/arena", label: "Arena" },
  { href: "/royale", label: "Royale" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/referrals", label: "Referrals" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isLanding = pathname === "/";

  return (
    <>
      <Toaster richColors position="bottom-right" theme="dark" />
      <CursorGlow />

      {/* Grid overlay */}
      <div className="grid-bg-fixed" />
      <div className="scanlines" />

      <nav
        className={`border-b bg-black/95 backdrop-blur supports-[backdrop-filter]:bg-black/80 sticky top-0 z-50 transition-shadow duration-150 ${
          scrolled
            ? "border-[#222] shadow-lg shadow-black/40"
            : "border-[#222]"
        }`}
      >
        <div className="container flex h-12 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center bg-lime">
              <span className="text-black font-bold text-sm font-display">A</span>
            </div>
            <span className="text-base font-semibold tracking-tight text-foreground font-display">
              Alpha<span className="text-lime">Arena</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-0">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-4 py-3.5 text-[11px] font-medium uppercase tracking-[1.5px] transition-colors ${
                  pathname === item.href
                    ? "text-lime"
                    : "text-muted-foreground hover:text-foreground hover:bg-[#111]"
                }`}
              >
                {item.label}
                {pathname === item.href && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-lime"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 mr-2">
              <div className="w-1.5 h-1.5 bg-lime rounded-full animate-pulse-dot" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-[1px]">
                Pacifica Testnet
              </span>
            </div>
            <WalletConnect />
            <button
              className="md:hidden p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 top-12 z-40 md:hidden border-b border-[#222] bg-black/98 backdrop-blur-xl"
          >
            <div className="container py-2 space-y-0">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-3 text-[11px] font-medium uppercase tracking-[1.5px] transition-colors min-h-[44px] flex items-center ${
                    pathname === item.href
                      ? "bg-lime-dim text-lime border-l-2 border-lime"
                      : "text-muted-foreground hover:text-foreground hover:bg-[#111]"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-[1]">
        <RouteTransition>{children}</RouteTransition>
      </main>

      {!isLanding && (
        <footer className="relative z-[1] border-t border-[#222] py-5 mt-16">
          <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center bg-lime">
                <span className="text-black font-bold text-[9px] font-display">A</span>
              </div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-[1px]">
                &copy; 2026 AlphaArena. Built on Pacifica.
              </span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/terms" className="text-[10px] text-muted-foreground uppercase tracking-[1px] hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="text-[10px] text-muted-foreground uppercase tracking-[1px] hover:text-foreground transition-colors">
                Privacy
              </Link>
            </div>
          </div>
        </footer>
      )}
    </>
  );
}
