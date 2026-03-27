"use client";

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Trophy, Users, Zap, Shield } from "lucide-react"
import { motion } from "framer-motion"
import { AnimatedCounter } from "@/components/animated-counter"

import { ActivityFeed } from "@/components/activity-feed"

interface PlatformStats {
  totalVolume: number;
  totalTraders: number;
  totalCompetitions: number;
  totalPrizes: number;
}

function usePlatformStats() {
  const [stats, setStats] = useState<PlatformStats>({
    totalVolume: 0,
    totalTraders: 0,
    totalCompetitions: 0,
    totalPrizes: 0,
  });

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStats({
            totalVolume: data.data.totalVolume || 0,
            totalTraders: data.data.totalTraders || 0,
            totalCompetitions: data.data.totalCompetitions || 0,
            totalPrizes: data.data.totalPrizes || 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  return stats;
}

export default function Home() {
  const stats = usePlatformStats();

  return (
      <div className="min-h-screen bg-background relative">

        {/* Hero */}
        <section className="container py-20 md:py-28">
          <div className="relative">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[2px] text-lime mb-8 px-3 py-1.5 border border-lime-dim bg-lime-dim">
                <span className="font-bold">&gt;</span>
                Season 1 Active
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-black tracking-[-3px] leading-[0.95] mb-6">
                <span className="text-foreground">Compete.</span>
                <br />
                <span className="text-muted-foreground">Copy.</span>
                <br />
                <span className="text-stroke-lime">Conquer.</span>
              </h1>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="text-sm text-muted-foreground max-w-lg leading-relaxed mb-10 font-light">
                The command center for <span className="text-foreground font-medium">elite copy-trading</span>.
                Follow verified traders on Pacifica, compete in weekly Trading Royale
                tournaments, and climb the global leaderboard.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="flex gap-3 mb-16"
            >
              <Link href="/arena" target="_blank">
                <button className="flex items-center gap-2 px-8 py-3 bg-lime text-black text-xs font-bold uppercase tracking-[2px] hover:bg-[#D4FF4D] transition-all hover:-translate-y-0.5">
                  Enter Arena
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
              <Link href="/arena" target="_blank">
                <button className="px-8 py-3 border border-[#333] text-muted-foreground text-xs font-medium uppercase tracking-[2px] hover:border-muted-foreground hover:text-foreground transition-all">
                  Browse Traders
                </button>
              </Link>
            </motion.div>

            {/* Stats Bar */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 border border-[#222] mb-16">
                <div className="p-5 border-r border-b md:border-b-0 border-[#222]">
                  <div className="label-mono flex items-center gap-1.5 mb-2">
                    <span className="w-1 h-1 bg-lime inline-block" />
                    Total Volume
                  </div>
                  <div className="text-2xl md:text-3xl font-bold font-display tracking-tight text-lime tabular-nums">
                    <AnimatedCounter
                      value={stats.totalVolume}
                      prefix="$"
                      formatFn={(n) => n >= 1000000 ? (n/1000000).toFixed(1) + "M" : n >= 1000 ? (n/1000).toFixed(0) + "K" : String(Math.round(n))}
                    />
                  </div>
                </div>
                <div className="p-5 border-b md:border-b-0 md:border-r border-[#222]">
                  <div className="label-mono flex items-center gap-1.5 mb-2">
                    <span className="w-1 h-1 bg-lime inline-block" />
                    Tracked Traders
                  </div>
                  <div className="text-2xl md:text-3xl font-bold font-display tracking-tight tabular-nums">
                    <AnimatedCounter value={stats.totalTraders} />
                  </div>
                </div>
                <div className="p-5 border-r border-[#222]">
                  <div className="label-mono flex items-center gap-1.5 mb-2">
                    <span className="w-1 h-1 bg-lime inline-block" />
                    Competitions
                  </div>
                  <div className="text-2xl md:text-3xl font-bold font-display tracking-tight tabular-nums">
                    <AnimatedCounter value={stats.totalCompetitions} />
                  </div>
                </div>
                <div className="p-5">
                  <div className="label-mono flex items-center gap-1.5 mb-2">
                    <span className="w-1 h-1 bg-lime inline-block" />
                    Prizes Awarded
                  </div>
                  <div className="text-2xl md:text-3xl font-bold font-display tracking-tight text-ice tabular-nums">
                    <AnimatedCounter
                      value={stats.totalPrizes}
                      prefix="$"
                      formatFn={(n) => n >= 1000 ? (n/1000).toFixed(0) + "K" : String(Math.round(n))}
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Live Activity */}
            <div className="mb-16">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#222]">
                <span className="text-[11px] uppercase tracking-[2px] text-muted-foreground section-prefix">
                  Live Activity
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-positive uppercase tracking-[1px]">
                  <span className="w-1.5 h-1.5 bg-positive rounded-full animate-pulse-dot" />
                  Real-time
                </span>
              </div>
              <ActivityFeed />
            </div>

            {/* Features */}
            <div className="mb-16">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#222]">
                <span className="text-[11px] uppercase tracking-[2px] text-muted-foreground section-prefix">
                  Platform Architecture
                </span>
              </div>
              <div className="grid md:grid-cols-3 gap-px bg-[#222] border border-[#222]">
                <div className="bg-[#0A0A0A] p-7 relative hover:bg-[#111] transition-colors card-hover" data-index="01">
                  <div className="absolute top-4 right-5 text-[10px] text-muted-foreground">01</div>
                  <div className="flex h-10 w-10 items-center justify-center border border-lime-dim bg-lime-dim text-lime mb-5">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <h3 className="font-display font-bold text-base mb-2">Trading Royale</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed font-light">
                    Weekly competitions with real prize pools. Performance-ranked. Fully on-chain verification through Pacifica DEX.
                  </p>
                </div>
                <div className="bg-[#0A0A0A] p-7 relative hover:bg-[#111] transition-colors card-hover" data-index="02">
                  <div className="absolute top-4 right-5 text-[10px] text-muted-foreground">02</div>
                  <div className="flex h-10 w-10 items-center justify-center border border-lime-dim bg-lime-dim text-lime mb-5">
                    <Users className="h-5 w-5" />
                  </div>
                  <h3 className="font-display font-bold text-base mb-2">One-Click Copy</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed font-light">
                    Mirror any verified trader&apos;s positions proportionally. Real-time sync with automatic position management.
                  </p>
                </div>
                <div className="bg-[#0A0A0A] p-7 relative hover:bg-[#111] transition-colors card-hover" data-index="03">
                  <div className="absolute top-4 right-5 text-[10px] text-muted-foreground">03</div>
                  <div className="flex h-10 w-10 items-center justify-center border border-lime-dim bg-lime-dim text-lime mb-5">
                    <Shield className="h-5 w-5" />
                  </div>
                  <h3 className="font-display font-bold text-base mb-2">Verified Traders</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed font-light">
                    All traders synced from Pacifica. Transparent track records. Auditable PnL, win rates, and risk metrics.
                  </p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="border border-lime-mid bg-lime-dim p-12 md:p-16 text-center relative hover:border-lime/30 transition-colors card-hover">
              <h2 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight mb-3">
                Ready to Enter the Arena?
              </h2>
              <p className="text-muted-foreground text-sm mb-7 font-light">
                Connect your wallet. Copy the best. Compete for glory.
              </p>
              <Link href="/arena" target="_blank">
                <button className="flex items-center gap-2 px-8 py-3 bg-lime text-black text-xs font-bold uppercase tracking-[2px] hover:bg-[#D4FF4D] transition-all hover:-translate-y-0.5 mx-auto">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* Footer (landing has its own) */}
        <footer className="relative z-[1] border-t border-[#222] py-5">
          <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="AlphaArena"
                width={20}
                height={20}
                className="h-5 w-5 object-contain"
              />
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
              <Link href="/referrals" className="text-[10px] text-muted-foreground uppercase tracking-[1px] hover:text-foreground transition-colors">
                Referrals
              </Link>
            </div>
          </div>
        </footer>
      </div>
  )
}
