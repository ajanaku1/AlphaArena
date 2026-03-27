"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion } from "framer-motion";

import { ScrollReveal } from "@/components/scroll-reveal";
import {
  Trophy,
  Medal,
  Crown,
  Target,
  Users,
  TrendingUp,
  TrendingDown,
  Clock,
  Award,
  Flame,
  Star,
  Zap,
  RefreshCw,
  ArrowLeft,
  DollarSign,
  Gift,
  Megaphone,
} from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";

// ============================================================================
// Types
// ============================================================================

interface LeaderboardEntry {
  rank: number | null;
  userId: string;
  username: string;
  avatarUrl: string | null;
  pnlPercent: number;
  pnlUsd: number;
  copiedTradersCount: number;
}

interface Competition {
  id: string;
  name: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status: string;
  prizePool: number;
  firstPlacePrize: number;
  secondPlacePrize: number;
  thirdPlacePrize: number;
  totalParticipants: number;
  timeRemainingMs: number;
}

interface UserEntry {
  rank: number | null;
  pnlPercent: number;
  pnlUsd: number;
  totalAllocated: number;
  copiedTradersCount: number;
}

interface Badge {
  id: string;
  type: string;
  competition: {
    id: string;
    name: string;
    endAt: string;
  } | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

interface BadgeCounts {
  total: number;
  royalWinner: number;
  top10: number;
  top50: number;
  firstCopy: number;
  diversifier: number;
  whale: number;
  referrer: number;
  influencer: number;
  profitMaster: number;
  comebackKing: number;
}

// ============================================================================
// Royale Page
// ============================================================================

export default function RoyalePage() {
  const { walletAddress } = useWallet();
  const [timeRemaining, setTimeRemaining] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  // Fetch competition and leaderboard
  const { data, isLoading, error, refetch } = useQuery<{
    data: {
      competition: Competition;
      leaderboard: LeaderboardEntry[];
      userEntry: UserEntry | null;
    };
  }>({
    queryKey: ["competition", "active", walletAddress],
    queryFn: async () => {
      const res = await fetch("/api/competition/active?limit=50", {
        headers: { ...(walletAddress && { "x-user-id": walletAddress }) },
      });
      if (!res.ok) throw new Error("Failed to fetch competition");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch user badges
  const { data: badgesData } = useQuery<{ data: { badges: Badge[]; counts: BadgeCounts } }>({
    queryKey: ["badges", walletAddress],
    queryFn: async () => {
      const res = await fetch("/api/badges", {
        headers: { ...(walletAddress && { "x-user-id": walletAddress }) },
      });
      if (!res.ok) throw new Error("Failed to fetch badges");
      return res.json();
    },
    enabled: !!walletAddress,
  });

  // Update countdown timer
  useEffect(() => {
    if (!data?.data.competition.timeRemainingMs) return;

    const updateTimer = () => {
      const remaining = Math.max(0, data.data.competition.timeRemainingMs - Date.now() + new Date().getTime());

      const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
      const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

      setTimeRemaining({ days, hours, minutes, seconds });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [data?.data.competition.timeRemainingMs]);

  const formatPnl = (pnl: number) => {
    const sign = pnl >= 0 ? "+" : "";
    return `${sign}$${Math.abs(pnl).toFixed(2)}`;
  };

  const formatPnlPercent = (pnl: number) => {
    const sign = pnl >= 0 ? "+" : "";
    return `${sign}${pnl.toFixed(2)}%`;
  };

  const getPnlColor = (pnl: number) => {
    if (pnl > 0) return "text-positive";
    if (pnl < 0) return "text-negative";
    return "text-muted-foreground";
  };

  const getRankMedal = (rank: number | null) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-[#FFD700]" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-[#C0C0C0]" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-[#CD7F32]" />;
    return <span className="w-5 text-center font-semibold text-xs tabular-nums">{rank}</span>;
  };

  const getBadgeIcon = (type: string) => {
    switch (type) {
      case "ROYAL_WINNER":
        return <Crown className="h-5 w-5" />;
      case "TOP_10":
        return <Star className="h-5 w-5" />;
      case "TOP_50":
        return <Award className="h-5 w-5" />;
      case "FIRST_COPY":
        return <Zap className="h-5 w-5" />;
      case "DIVERSIFIER":
        return <Users className="h-5 w-5" />;
      case "WHALE":
        return <DollarSign className="h-5 w-5" />;
      case "REFERRER":
        return <Gift className="h-5 w-5" />;
      case "INFLUENCER":
        return <Megaphone className="h-5 w-5" />;
      case "PROFIT_MASTER":
        return <TrendingUp className="h-5 w-5" />;
      case "COMEBACK_KING":
        return <Flame className="h-5 w-5" />;
      default:
        return <Award className="h-5 w-5" />;
    }
  };

  const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case "ROYAL_WINNER":
        return "bg-[#FFD700]/10 text-[#FFD700] border-[#FFD700]/30";
      case "TOP_10":
        return "bg-ice/10 text-ice border-ice/30";
      case "TOP_50":
        return "bg-blue-500/10 text-blue-500 border-blue-500/30";
      case "FIRST_COPY":
        return "bg-positive/10 text-positive border-positive/30";
      case "DIVERSIFIER":
        return "bg-purple-500/10 text-purple-500 border-purple-500/30";
      case "WHALE":
        return "bg-[#FFD700]/10 text-[#FFD700] border-[#FFD700]/30";
      case "REFERRER":
        return "bg-pink-500/10 text-pink-500 border-pink-500/30";
      case "INFLUENCER":
        return "bg-rose-500/10 text-rose-500 border-rose-500/30";
      case "PROFIT_MASTER":
        return "bg-positive/10 text-positive border-positive/30";
      case "COMEBACK_KING":
        return "bg-orange-500/10 text-orange-500 border-orange-500/30";
      default:
        return "bg-[#111] text-muted-foreground border-[#222]";
    }
  };

  return (
      <div className="min-h-screen bg-background">
        <motion.div className="container py-8" initial="hidden" animate="visible" variants={stagger}>
          {/* Back Button */}
          <motion.div variants={fadeUp}>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[1.5px] text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>
          </motion.div>

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-6">
              <div className="h-64 skeleton-shimmer border border-[#222]" />
              <div className="h-96 skeleton-shimmer border border-[#222]" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="border border-negative/40 bg-negative/5 p-6">
              <div className="text-center py-12">
                <p className="text-negative text-xs uppercase tracking-[1px] mb-4">
                  Failed to load competition data
                </p>
                <button
                  onClick={() => refetch()}
                  className="px-6 py-2 border border-[#333] text-xs uppercase tracking-[1.5px] text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {data?.data && (
            <>
              {/* ============================================================ */}
              {/* Hero Section                                                 */}
              {/* ============================================================ */}
              <motion.div variants={fadeUp}>
              <div className="relative overflow-hidden border border-[#222] bg-[#0A0A0A] p-8 mb-8">
                {/* Background grid overlay */}
                <div className="absolute inset-0 grid-overlay opacity-[0.04]" />
                {/* Subtle lime glow in top-right */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-lime/[0.03] blur-3xl pointer-events-none" />

                <div className="relative z-10">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
                    <div className="flex items-center gap-4">
                      {/* Trophy icon box */}
                      <div className="flex h-14 w-14 items-center justify-center bg-[#FFD700]/10 border border-[#FFD700]/30">
                        <Trophy className="h-7 w-7 text-[#FFD700]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Flame className="h-4 w-4 text-[#FFD700]" />
                          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                            Trading Royale
                          </h1>
                        </div>
                        <p className="text-[9px] uppercase tracking-[2px] text-muted-foreground">
                          {data.data.competition.name}
                        </p>
                      </div>
                    </div>

                    {/* Countdown Timer */}
                    <div className="flex items-center gap-3 border border-lime/30 bg-black px-5 py-3">
                      <Clock className="h-4 w-4 text-lime" />
                      <div className="flex items-center gap-1 font-mono text-lg tabular-nums">
                        <div className="flex flex-col items-center">
                          <span className="text-2xl font-bold text-foreground">
                            {String(timeRemaining.days).padStart(2, "0")}
                          </span>
                          <span className="text-[8px] uppercase tracking-[2px] text-muted-foreground">Day</span>
                        </div>
                        <span className="text-lime mx-1 text-xl">:</span>
                        <div className="flex flex-col items-center">
                          <span className="text-2xl font-bold text-foreground">
                            {String(timeRemaining.hours).padStart(2, "0")}
                          </span>
                          <span className="text-[8px] uppercase tracking-[2px] text-muted-foreground">Hr</span>
                        </div>
                        <span className="text-lime mx-1 text-xl">:</span>
                        <div className="flex flex-col items-center">
                          <span className="text-2xl font-bold text-foreground">
                            {String(timeRemaining.minutes).padStart(2, "0")}
                          </span>
                          <span className="text-[8px] uppercase tracking-[2px] text-muted-foreground">Min</span>
                        </div>
                        <span className="text-lime mx-1 text-xl">:</span>
                        <div className="flex flex-col items-center">
                          <span className="text-2xl font-bold text-foreground">
                            {String(timeRemaining.seconds).padStart(2, "0")}
                          </span>
                          <span className="text-[8px] uppercase tracking-[2px] text-muted-foreground">Sec</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Prize Pool Cards */}
                  <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
                    {/* 1st Place - Gold */}
                    <motion.div variants={fadeUp} className="border border-[#FFD700]/30 bg-[#FFD700]/5 p-4 text-center relative card-hover">
                      <div className="absolute top-2 right-3 text-[8px] text-[#FFD700]/40 uppercase tracking-[2px]">01</div>
                      <Crown className="h-5 w-5 text-[#FFD700] mx-auto mb-2" />
                      <div className="text-xl font-bold text-[#FFD700] tabular-nums">
                        ${data.data.competition.firstPlacePrize}
                      </div>
                      <div className="text-[9px] uppercase tracking-[2px] text-[#FFD700]/60 mt-1">1st Place</div>
                    </motion.div>
                    {/* 2nd Place - Silver */}
                    <motion.div variants={fadeUp} className="border border-[#C0C0C0]/30 bg-[#C0C0C0]/5 p-4 text-center relative card-hover">
                      <div className="absolute top-2 right-3 text-[8px] text-[#C0C0C0]/40 uppercase tracking-[2px]">02</div>
                      <Medal className="h-5 w-5 text-[#C0C0C0] mx-auto mb-2" />
                      <div className="text-xl font-bold text-[#C0C0C0] tabular-nums">
                        ${data.data.competition.secondPlacePrize}
                      </div>
                      <div className="text-[9px] uppercase tracking-[2px] text-[#C0C0C0]/60 mt-1">2nd Place</div>
                    </motion.div>
                    {/* 3rd Place - Bronze */}
                    <motion.div variants={fadeUp} className="border border-[#CD7F32]/30 bg-[#CD7F32]/5 p-4 text-center relative card-hover">
                      <div className="absolute top-2 right-3 text-[8px] text-[#CD7F32]/40 uppercase tracking-[2px]">03</div>
                      <Medal className="h-5 w-5 text-[#CD7F32] mx-auto mb-2" />
                      <div className="text-xl font-bold text-[#CD7F32] tabular-nums">
                        ${data.data.competition.thirdPlacePrize}
                      </div>
                      <div className="text-[9px] uppercase tracking-[2px] text-[#CD7F32]/60 mt-1">3rd Place</div>
                    </motion.div>
                    {/* Participants */}
                    <motion.div variants={fadeUp} className="border border-lime/20 bg-lime-dim p-4 text-center relative card-hover">
                      <div className="absolute top-2 right-3 text-[8px] text-lime/30 uppercase tracking-[2px]">Live</div>
                      <Users className="h-5 w-5 text-lime mx-auto mb-2" />
                      <div className="text-xl font-bold text-lime tabular-nums">
                        {data.data.competition.totalParticipants}
                      </div>
                      <div className="text-[9px] uppercase tracking-[2px] text-lime/60 mt-1">Traders</div>
                    </motion.div>
                  </motion.div>
                </div>
              </div>
              </motion.div>

              {/* ============================================================ */}
              {/* User Badge Showcase                                          */}
              {/* ============================================================ */}
              {badgesData?.data && badgesData.data.counts.total > 0 && (
                <motion.div variants={fadeUp}>
                <div className="border border-[#222] bg-[#0A0A0A] mb-8">
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-[#222]">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-lime" />
                      <h2 className="font-display text-sm font-semibold tracking-tight section-prefix">
                        Your Badges
                      </h2>
                    </div>
                    <div className="flex gap-2">
                      {badgesData.data.counts.royalWinner > 0 && (
                        <span className="flex items-center gap-1 px-2.5 py-1 border border-[#FFD700]/30 bg-[#FFD700]/10 text-[#FFD700] text-[10px] font-semibold">
                          <Crown className="h-3 w-3" />
                          {badgesData.data.counts.royalWinner}
                        </span>
                      )}
                      {badgesData.data.counts.top10 > 0 && (
                        <span className="flex items-center gap-1 px-2.5 py-1 border border-ice/30 bg-ice/10 text-ice text-[10px] font-semibold">
                          <Star className="h-3 w-3" />
                          {badgesData.data.counts.top10}
                        </span>
                      )}
                      {badgesData.data.counts.top50 > 0 && (
                        <span className="flex items-center gap-1 px-2.5 py-1 border border-blue-500/30 bg-blue-500/10 text-blue-500 text-[10px] font-semibold">
                          <Award className="h-3 w-3" />
                          {badgesData.data.counts.top50}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Badge list */}
                  <div className="p-5">
                    <div className="flex gap-3 flex-wrap">
                      {badgesData.data.badges.slice(0, 8).map((badge) => (
                        <div
                          key={badge.id}
                          className={`flex items-center gap-2 px-3 py-2 border ${getBadgeColor(badge.type)}`}
                        >
                          {getBadgeIcon(badge.type)}
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[1px]">
                              {badge.type.replace("_", " ")}
                            </div>
                            {badge.competition && (
                              <div className="text-[9px] opacity-60 truncate max-w-[120px]">
                                {badge.competition.name}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                </motion.div>
              )}

              {/* ============================================================ */}
              {/* User Rank Card (if participating)                            */}
              {/* ============================================================ */}
              {data.data.userEntry && (
                <motion.div variants={fadeUp}>
                <div
                  className={`border bg-[#0A0A0A] mb-8 p-6 ${
                    data.data.userEntry.rank && data.data.userEntry.rank <= 3
                      ? "border-[#FFD700]/30 bg-[#FFD700]/[0.03]"
                      : "border-[#222]"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center border ${
                          data.data.userEntry.rank === 1
                            ? "border-[#FFD700]/40 bg-[#FFD700]/10"
                            : data.data.userEntry.rank === 2
                            ? "border-[#C0C0C0]/40 bg-[#C0C0C0]/10"
                            : data.data.userEntry.rank === 3
                            ? "border-[#CD7F32]/40 bg-[#CD7F32]/10"
                            : "border-lime/30 bg-lime-dim"
                        }`}
                      >
                        {getRankMedal(data.data.userEntry.rank)}
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground">Your Rank</div>
                        <div className="text-2xl font-bold font-display tabular-nums">
                          #{data.data.userEntry.rank}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-8">
                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground mb-1">PnL</div>
                        <div className={`text-lg font-bold tabular-nums ${getPnlColor(data.data.userEntry.pnlUsd)}`}>
                          {formatPnl(data.data.userEntry.pnlUsd)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground mb-1">Return</div>
                        <div className={`text-lg font-bold tabular-nums ${getPnlColor(data.data.userEntry.pnlPercent)}`}>
                          {formatPnlPercent(data.data.userEntry.pnlPercent)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground mb-1">Traders</div>
                        <div className="text-lg font-bold tabular-nums">
                          {data.data.userEntry.copiedTradersCount}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </motion.div>
              )}

              {/* ============================================================ */}
              {/* Leaderboard Table                                            */}
              {/* ============================================================ */}
              <motion.div variants={fadeUp}>
              <ScrollReveal>
              <div className="border border-[#222] overflow-hidden">
                {/* Table Header Bar */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#222] bg-[#111]">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-lime" />
                    <h2 className="font-display text-sm font-semibold tracking-tight section-prefix">
                      Leaderboard
                    </h2>
                  </div>
                  <button
                    onClick={() => refetch()}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-[#222] text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground hover:text-foreground hover:border-[#333] transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </button>
                </div>

                {/* Column Headers */}
                <div className="grid grid-cols-12 gap-4 px-5 py-2.5 bg-[#0A0A0A] border-b border-[#222]">
                  <div className="col-span-1 text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium">
                    Rank
                  </div>
                  <div className="col-span-4 text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium">
                    Trader
                  </div>
                  <div className="col-span-2 text-right text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium">
                    PnL
                  </div>
                  <div className="col-span-2 text-right text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium">
                    Return
                  </div>
                  <div className="col-span-2 text-right text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium">
                    Traders
                  </div>
                  <div className="col-span-1" />
                </div>

                {/* Table Rows */}
                <div className="divide-y divide-[#222]">
                  {data.data.leaderboard.map((entry, index) => {
                    const isUserRow = !!data?.data?.userEntry && entry.rank === data.data.userEntry.rank;
                    const isTop3 = entry.rank && entry.rank <= 3;

                    return (
                      <motion.div
                        key={entry.userId}
                        initial={{ opacity: 0, x: -8 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.3, delay: index * 0.03 }}
                        className={`grid grid-cols-12 gap-4 px-5 py-3 items-center transition-colors ${
                          isUserRow
                            ? "bg-lime-dim border-l-2 border-l-lime"
                            : "hover:bg-[#0A0A0A]"
                        } ${
                          isTop3 && !isUserRow
                            ? "bg-[#FFD700]/[0.02]"
                            : ""
                        }`}
                      >
                        {/* Rank */}
                        <div className="col-span-1">
                          <div className="flex items-center justify-center">
                            {getRankMedal(entry.rank)}
                          </div>
                        </div>

                        {/* Trader */}
                        <div className="col-span-4">
                          <div className="flex items-center gap-3">
                            {/* Sharp square avatar */}
                            <div className="h-8 w-8 shrink-0 border border-[#222] bg-[#111] flex items-center justify-center overflow-hidden">
                              {entry.avatarUrl ? (
                                <img
                                  src={entry.avatarUrl}
                                  alt={entry.username}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                  {entry.username[0]}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="text-xs font-semibold">{entry.username}</div>
                              {isUserRow && (
                                <div className="text-[10px] text-lime font-medium">You</div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* PnL */}
                        <div className="col-span-2 text-right">
                          <div className={`text-xs font-semibold tabular-nums ${getPnlColor(entry.pnlUsd)}`}>
                            {formatPnl(entry.pnlUsd)}
                          </div>
                        </div>

                        {/* Return % */}
                        <div className="col-span-2 text-right">
                          <div className={`text-xs font-semibold tabular-nums ${getPnlColor(entry.pnlPercent)}`}>
                            {formatPnlPercent(entry.pnlPercent)}
                          </div>
                        </div>

                        {/* Traders Count */}
                        <div className="col-span-2 text-right">
                          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />
                            <span className="tabular-nums">{entry.copiedTradersCount}</span>
                          </div>
                        </div>

                        {/* Trend Indicator */}
                        <div className="col-span-1 text-right">
                          {entry.pnlPercent >= 0 ? (
                            <TrendingUp className="h-3.5 w-3.5 text-positive ml-auto" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5 text-negative ml-auto" />
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
              </ScrollReveal>
              </motion.div>
            </>
          )}
        </motion.div>
      </div>
  );
}
