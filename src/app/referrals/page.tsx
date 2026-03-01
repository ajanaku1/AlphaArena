"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { motion, type Variants } from "framer-motion";

import { ScrollReveal } from "@/components/scroll-reveal";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useWallet } from "@solana/wallet-adapter-react";
import { generateReferralLink } from "@/lib/fuul";
import {
  Copy,
  Share2,
  Users,
  Award,
  TrendingUp,
  Gift,
  Zap,
  Crown,
  Medal,
  ExternalLink,
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  LinkIcon,
  Wallet,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface RecentReferral {
  id: string;
  referredUser: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
  pointsAwarded: number;
  source: string;
  createdAt: string;
}

interface ReferralStats {
  totalReferrals: number;
  totalPoints: number;
  referralCode: string | null;
  recentReferrals: RecentReferral[];
}

interface LeaderboardEntry {
  userId: string;
  username: string;
  avatarUrl: string | null;
  referralPoints: number;
  totalReferrals: number;
  rank: number;
}

// ============================================================================
// Referrals Page
// ============================================================================

export default function ReferralsPage() {
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const { publicKey } = useWallet();
  const [copied, setCopied] = useState(false);
  const [applyCode, setApplyCode] = useState("");

  const walletAddress = publicKey?.toBase58();
  const userId = user?.id;

  // Animation variants
  const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
  const fadeUp: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
  };

  // Fetch user's referral stats
  const { data: statsData, isLoading: statsLoading, refetch } = useQuery<{ data: ReferralStats }>({
    queryKey: ["referrals", "me", walletAddress],
    queryFn: async () => {
      const res = await fetch(`/api/referrals/me`, {
        headers: { "x-user-id": walletAddress! },
      });
      if (!res.ok) throw new Error("Failed to fetch referral stats");
      return res.json();
    },
    enabled: !!walletAddress,
  });

  // Fetch referral leaderboard
  const { data: leaderboardData } = useQuery<{ data: LeaderboardEntry[] }>({
    queryKey: ["referrals", "leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/referrals/leaderboard?limit=20");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
  });

  // Apply referral code mutation
  const applyReferralMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch("/api/referrals/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": walletAddress!,
        },
        body: JSON.stringify({ referralCode: code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to apply referral");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Referral applied! +${data.data?.pointsAwarded || 0} pts`);
      setApplyCode("");
      refetch();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Copy referral link using Fuul-compatible URL
  const handleCopyLink = async () => {
    if (!statsData?.data.referralCode) return;

    const shareUrl = generateReferralLink(statsData.data.referralCode);
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Referral link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  // Share referral
  const handleShare = async () => {
    if (!statsData?.data.referralCode) return;

    const shareUrl = generateReferralLink(statsData.data.referralCode);
    const shareData = {
      title: "Join AlphaArena",
      text: "Join me on AlphaArena - the ultimate gamified copy-trading platform! Use my referral link to earn bonus points.",
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-[var(--gold)]" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-orange-400" />;
    return <span className="w-5 text-center font-semibold text-muted-foreground">{rank}</span>;
  };

  // Not connected state
  if (!authLoading && !isAuthenticated) {
    return (
        <div className="container py-20">
          <motion.div
            className="max-w-md mx-auto text-center space-y-6"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex h-20 w-20 items-center justify-center border border-[#222] bg-[#0A0A0A] mx-auto">
              <Wallet className="h-10 w-10 text-lime" />
            </div>
            <h1 className="font-display text-2xl font-black uppercase tracking-[-1px]">
              Connect Wallet
            </h1>
            <p className="text-sm text-muted-foreground font-mono leading-relaxed">
              Connect your Solana wallet to access the referral program and start earning points.
            </p>
          </motion.div>
        </div>
    );
  }

  return (
      <motion.div className="container py-8" initial="hidden" animate="visible" variants={stagger}>
        {/* Back Button */}
        <motion.div variants={fadeUp}>
          <Link
            href="/"
            className="inline-flex items-center text-[10px] uppercase tracking-[2px] text-muted-foreground hover:text-lime transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-2" />
            Back to Home
          </Link>
        </motion.div>

        {/* Page Header */}
        <motion.div variants={fadeUp} className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
          <div>
            <span className="text-[9px] uppercase tracking-[2px] text-muted-foreground block mb-2">
              {'//'} REFERRAL PROGRAM
            </span>
            <h1 className="font-display text-4xl md:text-5xl font-black uppercase tracking-[-2px] leading-[0.95]">
              Refer & Earn
            </h1>
            <p className="text-sm text-muted-foreground mt-2 font-mono">
              Invite friends and earn points for every referral. Powered by Fuul.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-[2px] font-bold border border-[#222] bg-[#0A0A0A] text-muted-foreground hover:text-foreground hover:border-[#333] transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </motion.div>

        {/* Loading skeleton */}
        {(statsLoading || authLoading) && (
          <div className="space-y-6">
            <div className="h-48 skeleton-shimmer border border-[#222]" />
            <div className="grid md:grid-cols-2 gap-6">
              <div className="h-64 skeleton-shimmer border border-[#222]" />
              <div className="h-64 skeleton-shimmer border border-[#222]" />
            </div>
          </div>
        )}

        {statsData?.data && (
          <>
            {/* ============================================================ */}
            {/* Hero Referral Card                                           */}
            {/* ============================================================ */}
            <motion.div variants={fadeUp} className="border border-lime-dim bg-lime-dim mb-10 relative overflow-hidden">
              {/* Grid overlay */}
              <div className="absolute inset-0 grid-overlay opacity-[0.04] pointer-events-none" />

              <div className="relative z-10 p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center bg-lime text-black">
                      <Gift className="h-7 w-7" />
                    </div>
                    <div>
                      <h2 className="font-display text-xl md:text-2xl font-black uppercase tracking-[-1px]">
                        Your Referral Hub
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Share your link and earn rewards
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center px-5 py-3 bg-[#0A0A0A] border border-[#222]">
                      <div className="text-2xl font-black tabular-nums text-lime">
                        {statsData.data.totalReferrals}
                      </div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground mt-1">
                        Referrals
                      </div>
                    </div>
                    <div className="text-center px-5 py-3 bg-[#0A0A0A] border border-[#222]">
                      <div className="text-2xl font-black tabular-nums text-positive">
                        {statsData.data.totalPoints.toLocaleString()}
                      </div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground mt-1">
                        Points
                      </div>
                    </div>
                  </div>
                </div>

                {/* Referral Code + Link */}
                <div className="mt-8 p-4 bg-black border border-[#222]">
                  <div className="flex flex-col gap-4">
                    <div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground mb-1.5">
                        Your Referral Code
                      </div>
                      <div className="flex items-center gap-3">
                        <code className="text-xl font-mono font-black text-lime tracking-wider">
                          {statsData.data.referralCode || "Generating..."}
                        </code>
                        {copied && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] uppercase tracking-[2px] font-bold text-positive bg-[#00FF8810] border border-[#00FF8830]">
                            <CheckCircle className="h-3 w-3" />
                            Copied
                          </span>
                        )}
                      </div>
                    </div>

                    {statsData.data.referralCode && (
                      <div>
                        <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground mb-1.5">
                          Your Referral Link
                        </div>
                        <code className="text-xs font-mono text-muted-foreground truncate block max-w-[480px]">
                          {generateReferralLink(statsData.data.referralCode)}
                        </code>
                      </div>
                    )}

                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={handleCopyLink}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-[10px] uppercase tracking-[2px] font-bold border border-[#222] bg-[#111] text-foreground hover:border-lime hover:text-lime transition-all"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Link
                      </button>
                      <button
                        onClick={handleShare}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-[10px] uppercase tracking-[2px] font-bold bg-lime text-black hover:bg-[#D4FF4D] transition-all"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Share
                      </button>
                    </div>
                  </div>
                </div>

                {/* Apply Referral Code */}
                <div className="mt-4 p-4 bg-[#0A0A0A] border border-[#222]">
                  <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground mb-2">
                    Have a referral code?
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={applyCode}
                      onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
                      placeholder="Enter code (e.g. ALPHA-TRADER)"
                      className="flex-1 px-3 py-2 text-sm font-mono bg-black border border-[#222] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-lime transition-colors"
                    />
                    <button
                      onClick={() => applyCode && applyReferralMutation.mutate(applyCode)}
                      disabled={!applyCode || applyReferralMutation.isPending}
                      className="inline-flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-[2px] font-bold border border-[#222] bg-[#111] text-foreground hover:border-lime hover:text-lime transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#222] disabled:hover:text-foreground"
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                      {applyReferralMutation.isPending ? "Applying..." : "Apply"}
                    </button>
                  </div>
                </div>

                {/* Rewards Info — 3 reward tiers */}
                <motion.div className="mt-6 grid md:grid-cols-3 gap-3" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
                  <motion.div variants={fadeUp} className="flex items-center gap-3 p-3 bg-[#0A0A0A] border border-[#222] card-hover">
                    <div className="flex h-8 w-8 items-center justify-center bg-lime text-black shrink-0">
                      <Zap className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-lime tabular-nums">100 pts</div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground">
                        Per signup
                      </div>
                    </div>
                  </motion.div>
                  <motion.div variants={fadeUp} className="flex items-center gap-3 p-3 bg-[#0A0A0A] border border-[#222] card-hover">
                    <div className="flex h-8 w-8 items-center justify-center bg-ice-dim text-ice shrink-0">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-ice tabular-nums">500 pts</div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground">
                        First trade bonus
                      </div>
                    </div>
                  </motion.div>
                  <motion.div variants={fadeUp} className="flex items-center gap-3 p-3 bg-[#0A0A0A] border border-[#222] card-hover">
                    <div className="flex h-8 w-8 items-center justify-center bg-[#FFD70015] text-[var(--gold)] shrink-0">
                      <Award className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-[var(--gold)] tabular-nums">
                        1 pt / $1K
                      </div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground">
                        Volume bonus
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>

            {/* ============================================================ */}
            {/* Two-column: Recent Referrals + Leaderboard                   */}
            {/* ============================================================ */}
            <ScrollReveal>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Recent Referrals */}
              <div className="border border-[#222] bg-[#0A0A0A]">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#222]">
                  <Users className="h-4 w-4 text-lime" />
                  <h3 className="font-display text-sm font-bold uppercase tracking-[1px]">
                    <span className="section-prefix">Recent Referrals</span>
                  </h3>
                </div>
                <div>
                  {statsData.data.recentReferrals.length === 0 ? (
                    <div className="text-center py-14 text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-4 opacity-30" />
                      <p className="text-sm font-mono">No referrals yet</p>
                      <p className="text-[9px] uppercase tracking-[2px] text-muted-foreground mt-1">
                        Share your code to start earning
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#222]">
                      {statsData.data.recentReferrals.map((referral) => (
                        <div
                          key={referral.id}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-[#111] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {/* Avatar — sharp square */}
                            <div className="h-8 w-8 bg-[#111] border border-[#222] flex items-center justify-center text-xs font-bold text-muted-foreground uppercase">
                              {referral.referredUser.avatarUrl ? (
                                <img
                                  src={referral.referredUser.avatarUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                referral.referredUser.username?.[0] || "?"
                              )}
                            </div>
                            <div>
                              <div className="font-mono text-sm font-medium">
                                {referral.referredUser.username}
                              </div>
                              <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground">
                                {new Date(referral.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-black text-positive tabular-nums">
                              +{referral.pointsAwarded} pts
                            </div>
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[8px] uppercase tracking-[1.5px] font-bold text-muted-foreground bg-[#111] border border-[#222]">
                              {referral.source}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Referral Leaderboard */}
              <div className="border border-[#222] bg-[#0A0A0A]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#222]">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-[var(--gold)]" />
                    <h3 className="font-display text-sm font-bold uppercase tracking-[1px]">
                      <span className="section-prefix">Top Referrers</span>
                    </h3>
                  </div>
                  <Link
                    href="/leaderboard"
                    className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[2px] text-muted-foreground hover:text-lime transition-colors"
                  >
                    View All
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <div>
                  {leaderboardData?.data && leaderboardData.data.length > 0 ? (
                    <div className="divide-y divide-[#222]">
                      {leaderboardData.data.slice(0, 10).map((entry) => (
                        <div
                          key={entry.userId}
                          className={`flex items-center justify-between px-4 py-2.5 transition-colors ${
                            entry.userId === userId
                              ? "bg-lime-dim border-l-2 border-l-[var(--lime)]"
                              : "hover:bg-[#111]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-6 flex items-center justify-center">
                              {getRankIcon(entry.rank)}
                            </div>
                            {/* Avatar — sharp square */}
                            <div className="h-8 w-8 bg-[#111] border border-[#222] flex items-center justify-center text-xs font-bold text-muted-foreground uppercase">
                              {entry.avatarUrl ? (
                                <img
                                  src={entry.avatarUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                entry.username?.[0] || "?"
                              )}
                            </div>
                            <div>
                              <div className="font-mono text-sm font-medium">
                                {entry.username}
                              </div>
                              <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground">
                                {entry.totalReferrals} referrals
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-black text-lime tabular-nums">
                              {entry.referralPoints.toLocaleString()} pts
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-14 text-muted-foreground">
                      <Award className="h-10 w-10 mx-auto mb-4 opacity-30" />
                      <p className="text-sm font-mono">No referrals yet</p>
                      <p className="text-[9px] uppercase tracking-[2px] text-muted-foreground mt-1">
                        Be the first to refer
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            </ScrollReveal>

            {/* ============================================================ */}
            {/* How It Works                                                 */}
            {/* ============================================================ */}
            <ScrollReveal delay={0.1}>
            <div className="border border-[#222] bg-[#0A0A0A] mt-8">
              <div className="px-4 py-3 border-b border-[#222]">
                <h3 className="font-display text-sm font-bold uppercase tracking-[1px]">
                  <span className="section-prefix">How Referrals Work</span>
                </h3>
              </div>
              <div className="p-6 md:p-8">
                <div className="grid md:grid-cols-4 gap-6">
                  {/* Step 1 */}
                  <motion.div
                    className="text-center space-y-3"
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0 }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center bg-lime text-black font-black text-sm mx-auto">
                      1
                    </div>
                    <div className="font-display text-sm font-bold uppercase tracking-[1px]">
                      Share Link
                    </div>
                    <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground leading-relaxed">
                      Copy your unique referral link and share it with friends
                    </div>
                  </motion.div>

                  {/* Step 2 */}
                  <motion.div
                    className="text-center space-y-3"
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center bg-lime text-black font-black text-sm mx-auto">
                      2
                    </div>
                    <div className="font-display text-sm font-bold uppercase tracking-[1px]">
                      Friend Signs Up
                    </div>
                    <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground leading-relaxed">
                      They connect their wallet via your link and you earn 100 pts
                    </div>
                  </motion.div>

                  {/* Step 3 */}
                  <motion.div
                    className="text-center space-y-3"
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center bg-lime text-black font-black text-sm mx-auto">
                      3
                    </div>
                    <div className="font-display text-sm font-bold uppercase tracking-[1px]">
                      First Trade
                    </div>
                    <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground leading-relaxed">
                      When they make their first copy trade, you earn 500 bonus pts
                    </div>
                  </motion.div>

                  {/* Step 4 */}
                  <motion.div
                    className="text-center space-y-3"
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center bg-lime text-black font-black text-sm mx-auto">
                      4
                    </div>
                    <div className="font-display text-sm font-bold uppercase tracking-[1px]">
                      Volume Bonus
                    </div>
                    <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground leading-relaxed">
                      Earn 1 pt for every $1,000 in trading volume they generate
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
            </ScrollReveal>
          </>
        )}
      </motion.div>
  );
}
