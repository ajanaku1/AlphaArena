"use client"

import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"

import { ScrollReveal } from "@/components/scroll-reveal"
import { Trophy, Medal, ArrowLeft, Users } from "lucide-react"
import Link from "next/link"
import { useWallet } from "@/hooks/use-wallet"

// ============================================================================
// Types matching the actual API response from /api/leaderboard
// ============================================================================

interface LeaderboardEntry {
  rank: number | null
  userId: string
  username: string
  avatarUrl: string | null
  pnlPercent: number
  pnlUsd: number
  copiedTradersCount: number
}

interface Competition {
  id: string
  name: string
  status: string
  totalParticipants: number
}

interface UserEntry {
  rank: number | null
  pnlPercent: number
  pnlUsd: number
}

interface LeaderboardResponse {
  success: boolean
  data: {
    competition: Competition
    entries: LeaderboardEntry[]
    userEntry: UserEntry | null
  }
}

export default function LeaderboardPage() {
  const { walletAddress } = useWallet()

  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard", walletAddress],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard?limit=50", {
        headers: { ...(walletAddress && { "x-user-id": walletAddress }) },
      })
      if (!res.ok) throw new Error("Failed to fetch leaderboard")
      return res.json()
    },
  })

  const entries = data?.data?.entries || []
  const topThree = entries.slice(0, 3)
  const rest = entries.slice(3)

  const formatPnl = (pnl: number) => {
    const sign = pnl >= 0 ? "+" : ""
    return `${sign}$${Math.abs(pnl).toFixed(2)}`
  }

  const formatPnlPercent = (pnl: number) => {
    const sign = pnl >= 0 ? "+" : ""
    return `${sign}${pnl.toFixed(2)}%`
  }

  const getPnlColor = (pnl: number) => {
    if (pnl > 0) return "text-positive"
    if (pnl < 0) return "text-negative"
    return "text-muted-foreground"
  }

  const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }
  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
  }

  return (
      <div className="container py-8">
       <motion.div initial="hidden" animate="visible" variants={stagger}>
        {/* Header */}
        <motion.div variants={fadeUp} className="mb-10">
          <Link
            href="/arena"
            className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[2px] text-muted-foreground hover:text-lime transition-colors duration-150 mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Arena
          </Link>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-2 section-prefix">
            Trading Royale Leaderboard
          </h1>
          <p className="text-muted-foreground font-mono text-sm">
            Top performers in this week&apos;s competition
            {data?.data?.competition && (
              <span className="ml-3 text-[9px] uppercase tracking-[2px] text-muted-foreground border border-[#222] px-2 py-0.5 inline-block align-middle">
                {data.data.competition.totalParticipants} participants
              </span>
            )}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span className="w-1.5 h-1.5 bg-lime rounded-full animate-pulse-dot" />
            <span className="text-[10px] text-lime uppercase tracking-[1px]">Live Rankings</span>
          </div>
        </motion.div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="border border-[#222] bg-[#0A0A0A]">
            <div className="p-6">
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="h-14 skeleton-shimmer" />
                ))}
              </div>
            </div>
          </div>
        )}

        {entries.length > 0 && (
          <>
            {/* Top 3 Podium */}
            {topThree.length > 0 && (
              <motion.div variants={fadeUp} className="grid md:grid-cols-3 gap-4 mb-10">
                {/* 2nd Place */}
                {topThree[1] && (
                  <div className="border border-[#222] bg-[#0A0A0A] p-6 order-2 md:order-1 card-hover">
                    <div className="flex flex-col items-center text-center">
                      <Medal className="h-10 w-10 text-[#A0A0A0] mb-4" />
                      {/* Sharp square avatar */}
                      <span className="relative flex h-20 w-20 shrink-0 overflow-hidden mb-4">
                        {topThree[1].avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="aspect-square h-full w-full object-cover"
                            src={topThree[1].avatarUrl}
                            alt="Avatar"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-muted-foreground font-mono text-lg font-bold">
                            {topThree[1].username?.[0] || "?"}
                          </span>
                        )}
                      </span>
                      <h3 className="font-display font-semibold text-lg text-foreground mb-1">
                        {topThree[1].username || "Anonymous"}
                      </h3>
                      <span className="text-[9px] uppercase tracking-[2px] text-muted-foreground border border-[#222] px-3 py-1 mb-4 inline-block">
                        #2 Rank
                      </span>
                      <div className={`text-2xl font-bold tabular-nums font-mono ${getPnlColor(topThree[1].pnlPercent)}`}>
                        {formatPnlPercent(topThree[1].pnlPercent)}
                      </div>
                      <div className="text-sm text-muted-foreground tabular-nums font-mono">
                        {formatPnl(topThree[1].pnlUsd)}
                      </div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground mt-2 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {topThree[1].copiedTradersCount} traders
                      </div>
                    </div>
                  </div>
                )}

                {/* 1st Place */}
                {topThree[0] && (
                  <div className="border border-[#FFD700]/30 bg-[#0A0A0A] p-6 order-1 md:order-2 relative overflow-hidden glow-lime card-hover">
                    {/* Gold accent line at top */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#FFD700]" />
                    <div className="flex flex-col items-center text-center">
                      <Trophy className="h-14 w-14 text-[#FFD700] mb-4" />
                      {/* Sharp square avatar */}
                      <span className="relative flex h-24 w-24 shrink-0 overflow-hidden mb-4 border-2 border-[#FFD700]/40">
                        {topThree[0].avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="aspect-square h-full w-full object-cover"
                            src={topThree[0].avatarUrl}
                            alt="Avatar"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-muted-foreground font-mono text-xl font-bold">
                            {topThree[0].username?.[0] || "?"}
                          </span>
                        )}
                      </span>
                      <h3 className="font-display font-bold text-xl text-foreground mb-1">
                        {topThree[0].username || "Anonymous"}
                      </h3>
                      <span className="text-[9px] uppercase tracking-[2px] text-black bg-[#FFD700] px-3 py-1 mb-4 inline-block font-bold">
                        #1 Champion
                      </span>
                      <div className={`text-3xl font-bold tabular-nums font-mono ${getPnlColor(topThree[0].pnlPercent)}`}>
                        {formatPnlPercent(topThree[0].pnlPercent)}
                      </div>
                      <div className="text-sm text-muted-foreground tabular-nums font-mono">
                        {formatPnl(topThree[0].pnlUsd)}
                      </div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground mt-2 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {topThree[0].copiedTradersCount} traders
                      </div>
                    </div>
                  </div>
                )}

                {/* 3rd Place */}
                {topThree[2] && (
                  <div className="border border-[#222] bg-[#0A0A0A] p-6 order-3 card-hover">
                    <div className="flex flex-col items-center text-center">
                      <Medal className="h-10 w-10 text-[#CD7F32] mb-4" />
                      {/* Sharp square avatar */}
                      <span className="relative flex h-20 w-20 shrink-0 overflow-hidden mb-4">
                        {topThree[2].avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="aspect-square h-full w-full object-cover"
                            src={topThree[2].avatarUrl}
                            alt="Avatar"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-muted-foreground font-mono text-lg font-bold">
                            {topThree[2].username?.[0] || "?"}
                          </span>
                        )}
                      </span>
                      <h3 className="font-display font-semibold text-lg text-foreground mb-1">
                        {topThree[2].username || "Anonymous"}
                      </h3>
                      <span className="text-[9px] uppercase tracking-[2px] text-muted-foreground border border-[#222] px-3 py-1 mb-4 inline-block">
                        #3 Rank
                      </span>
                      <div className={`text-2xl font-bold tabular-nums font-mono ${getPnlColor(topThree[2].pnlPercent)}`}>
                        {formatPnlPercent(topThree[2].pnlPercent)}
                      </div>
                      <div className="text-sm text-muted-foreground tabular-nums font-mono">
                        {formatPnl(topThree[2].pnlUsd)}
                      </div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground mt-2 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {topThree[2].copiedTradersCount} traders
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Full Leaderboard Table */}
            {rest.length > 0 && (
              <div className="border border-[#222] bg-[#0A0A0A]">
                {/* Table header */}
                <motion.div variants={fadeUp} className="px-6 py-4 border-b border-[#222]">
                  <h2 className="font-display text-lg font-bold tracking-tight text-foreground section-prefix">
                    Full Rankings
                  </h2>
                </motion.div>
                {/* Table body */}
                <motion.div className="p-4 space-y-1" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
                  {rest.map((entry) => {
                    const isUserRow = !!data?.data?.userEntry && entry.rank === data.data.userEntry.rank
                    return (
                      <motion.div
                        key={entry.userId}
                        variants={fadeUp}
                        className={`flex items-center justify-between px-4 py-3 transition-colors duration-100 ${
                          isUserRow
                            ? "bg-ice-dim border border-[#00E5FF]/20"
                            : "bg-[#111] hover:bg-[#1A1A1A] border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Rank number */}
                          <div className="w-8 text-center font-mono font-bold text-muted-foreground text-sm tabular-nums">
                            {entry.rank}
                          </div>
                          {/* Sharp square avatar */}
                          <span className="relative flex h-8 w-8 shrink-0 overflow-hidden">
                            {entry.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                className="aspect-square h-full w-full object-cover"
                                src={entry.avatarUrl}
                                alt="Avatar"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center bg-[#1A1A1A] text-muted-foreground font-mono text-xs font-bold">
                                {entry.username?.[0] || "?"}
                              </span>
                            )}
                          </span>
                          <div>
                            <div className="font-mono font-medium text-sm text-foreground">
                              {entry.username || "Anonymous"}
                              {isUserRow && (
                                <span className="ml-2 text-[9px] uppercase tracking-[2px] text-ice">(You)</span>
                              )}
                            </div>
                            <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground flex items-center gap-2">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {entry.copiedTradersCount} traders
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-mono font-bold text-sm tabular-nums ${getPnlColor(entry.pnlPercent)}`}>
                            {formatPnlPercent(entry.pnlPercent)}
                          </div>
                          <div className={`font-mono text-xs tabular-nums ${getPnlColor(entry.pnlUsd)}`}>
                            {formatPnl(entry.pnlUsd)}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </motion.div>
              </div>
            )}
          </>
        )}
       </motion.div>
      </div>
  )
}
