"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EquityCurve } from "@/components/charts/equity-curve";
import { generateEquityData } from "@/lib/chart-utils";
import { motion } from "framer-motion";

import { ScrollReveal } from "@/components/scroll-reveal";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Activity,
  ArrowLeft,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  StopCircle,
  Share2,
  Download,
} from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";

// ============================================================================
// Types
// ============================================================================

interface Trader {
  id: string;
  displayName: string | null;
  pacificaTraderId: string;
  avatarUrl: string | null;
}

interface CopyPosition {
  id: string;
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  allocationUsd: number;
  status: string;
  realizedPnl: number;
  executionMode: string;
  pacificaOrderId: string | null;
  openedAt: string;
  closedAt: string | null;
  trader: Trader;
}

interface CopiedTrader {
  traderId: string;
  displayName: string | null;
  pacificaTraderId: string;
  positionCount: number;
  totalAllocated: number;
  totalPnl: number;
  totalPnlPercent: number;
  executionMode: string;
  positions: CopyPosition[];
}

interface PortfolioData {
  totalValue: number;
  totalAllocated: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: CopyPosition[];
  closedPositions: CopyPosition[];
  copiedTraders: CopiedTrader[];
  tradersCount: number;
}

interface ClosedTraderGroup {
  traderId: string;
  displayName: string | null;
  pacificaTraderId: string;
  avatarUrl: string | null;
  totalPnl: number;
  positionCount: number;
  lastClosedAt: string;
  positions: CopyPosition[];
}

type PnlCardData =
  | { type: "trader"; trader: CopiedTrader }
  | { type: "position"; position: CopyPosition }
  | { type: "history"; group: ClosedTraderGroup }
  | null;

const PAGE_SIZE = 10;

// ============================================================================
// Pagination Helper
// ============================================================================

function generatePageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push("...");

  pages.push(total);

  return pages;
}

// ============================================================================
// Pagination Controls Component
// ============================================================================

function PaginationControls({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
      <p className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono">
        Showing {(page - 1) * PAGE_SIZE + 1}&ndash;{Math.min(page * PAGE_SIZE, totalItems)} of {totalItems}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="h-8 w-8 flex items-center justify-center border border-[#222] bg-[#0A0A0A] text-muted-foreground hover:border-lime hover:text-lime transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {generatePageNumbers(page, totalPages).map((p, i) => {
          if (p === "...") {
            return (
              <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-xs font-mono">
                ...
              </span>
            );
          }
          return (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`h-8 w-8 flex items-center justify-center border text-xs font-mono transition-colors ${
                page === p
                  ? "border-lime bg-lime text-black font-bold"
                  : "border-[#222] bg-[#0A0A0A] text-muted-foreground hover:border-lime hover:text-lime"
              }`}
            >
              {p}
            </button>
          );
        })}

        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="h-8 w-8 flex items-center justify-center border border-[#222] bg-[#0A0A0A] text-muted-foreground hover:border-lime hover:text-lime transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Portfolio Page
// ============================================================================

export default function PortfolioPage() {
  const queryClient = useQueryClient();
  const { walletAddress, authenticated } = useWallet();
  const [expandedTraders, setExpandedTraders] = useState<Set<string>>(new Set());
  const [stopConfirm, setStopConfirm] = useState<{ traderId: string; name: string; count: number } | null>(null);
  const [historyTrader, setHistoryTrader] = useState<ClosedTraderGroup | null>(null);
  const [tradersPage, setTradersPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [pnlCard, setPnlCard] = useState<PnlCardData>(null);
  const pnlCardRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");

  const handleDownloadPnlCard = useCallback(async () => {
    if (!pnlCardRef.current) return;
    try {
      const dataUrl = await toPng(pnlCardRef.current, {
        pixelRatio: 2,
        backgroundColor: "#0a0a0a",
      });
      const link = document.createElement("a");
      link.download = "alphaarena-pnl.png";
      link.href = dataUrl;
      link.click();
    } catch {
      toast.error("Failed to download PnL card");
    }
  }, []);

  const handleShareToTwitter = useCallback(() => {
    if (!pnlCard) return;
    let text = "";
    if (pnlCard.type === "position") {
      const p = pnlCard.position;
      const sign = p.pnlPercent >= 0 ? "+" : "";
      text = `${p.symbol} ${p.side} ${sign}${p.pnlPercent.toFixed(2)}% on @AlphaArena_`;
    } else if (pnlCard.type === "trader") {
      const t = pnlCard.trader;
      const sign = t.totalPnlPercent >= 0 ? "+" : "";
      const name = t.displayName || `${t.pacificaTraderId.slice(0, 8)}...`;
      text = `Copying ${name}: ${sign}${t.totalPnlPercent.toFixed(2)}% return on @AlphaArena_`;
    } else if (pnlCard.type === "history") {
      const g = pnlCard.group;
      const totalAlloc = g.positions.reduce((s, p) => s + p.allocationUsd, 0);
      const pnlPct = totalAlloc > 0 ? (g.totalPnl / totalAlloc) * 100 : 0;
      const sign = pnlPct >= 0 ? "+" : "";
      const name = g.displayName || `${g.pacificaTraderId.slice(0, 8)}...`;
      text = `Closed copy of ${name}: ${sign}${pnlPct.toFixed(2)}% return on @AlphaArena_`;
    }
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://alphaarena.trade")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [pnlCard]);

  const toggleTrader = (traderId: string) => {
    setExpandedTraders((prev) => {
      const next = new Set(prev);
      if (next.has(traderId)) {
        next.delete(traderId);
      } else {
        next.add(traderId);
      }
      return next;
    });
  };

  const { data, isLoading, error, refetch } = useQuery<{ data: PortfolioData }>({
    queryKey: ["portfolio", walletAddress],
    queryFn: async () => {
      const res = await fetch("/api/portfolio", {
        headers: { ...(walletAddress && { "x-user-id": walletAddress }) },
      });
      if (!res.ok) throw new Error("Failed to fetch portfolio");
      return res.json();
    },
    enabled: !!walletAddress,
    refetchInterval: 30000,
  });

  // Copied traders pagination
  const allTraders = data?.data?.copiedTraders ?? [];
  const totalTradersPages = Math.max(1, Math.ceil(allTraders.length / PAGE_SIZE));
  const paginatedTraders = allTraders.slice(
    (tradersPage - 1) * PAGE_SIZE,
    tradersPage * PAGE_SIZE
  );

  useEffect(() => {
    if (tradersPage > totalTradersPages) {
      setTradersPage(totalTradersPages);
    }
  }, [tradersPage, totalTradersPages]);

  const closedByTrader = useMemo<ClosedTraderGroup[]>(() => {
    const positions = data?.data?.closedPositions;
    if (!positions || positions.length === 0) return [];

    const map = new Map<string, ClosedTraderGroup>();
    for (const pos of positions) {
      const existing = map.get(pos.trader.id);
      if (existing) {
        existing.totalPnl += pos.realizedPnl;
        existing.positionCount += 1;
        existing.positions.push(pos);
        if (pos.closedAt && pos.closedAt > existing.lastClosedAt) {
          existing.lastClosedAt = pos.closedAt;
        }
      } else {
        map.set(pos.trader.id, {
          traderId: pos.trader.id,
          displayName: pos.trader.displayName,
          pacificaTraderId: pos.trader.pacificaTraderId,
          avatarUrl: pos.trader.avatarUrl,
          totalPnl: pos.realizedPnl,
          positionCount: 1,
          lastClosedAt: pos.closedAt || pos.openedAt,
          positions: [pos],
        });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastClosedAt).getTime() - new Date(a.lastClosedAt).getTime()
    );
  }, [data?.data?.closedPositions]);

  const totalHistoryPages = Math.max(1, Math.ceil(closedByTrader.length / PAGE_SIZE));
  const paginatedHistory = closedByTrader.slice(
    (historyPage - 1) * PAGE_SIZE,
    historyPage * PAGE_SIZE
  );

  useEffect(() => {
    if (historyPage > totalHistoryPages) {
      setHistoryPage(totalHistoryPages);
    }
  }, [historyPage, totalHistoryPages]);

  // Build equity curve from actual position data
  const equityData = useMemo(() => {
    const portfolio = data?.data;
    if (!portfolio) return [];

    const allPositions = [...portfolio.openPositions, ...portfolio.closedPositions];
    if (allPositions.length === 0) {
      return generateEquityData(portfolio.totalValue, portfolio.totalPnl);
    }

    const today = new Date();
    const todayTs = today.getTime();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 30);

    const baseValue = portfolio.totalValue - portfolio.totalPnl;
    const points: { date: string; value: number }[] = [];

    for (let i = 0; i <= 30; i++) {
      const day = new Date(startDate);
      day.setDate(day.getDate() + i);
      const dayTs = day.getTime();

      let accumulatedPnl = 0;

      for (const pos of allPositions) {
        const openTs = new Date(pos.openedAt).getTime();

        if (openTs > dayTs) continue;

        if (pos.closedAt) {
          const closeTs = new Date(pos.closedAt).getTime();
          if (dayTs >= closeTs) {
            accumulatedPnl += pos.realizedPnl;
          } else {
            const duration = closeTs - openTs;
            const progress = duration > 0 ? (dayTs - openTs) / duration : 1;
            accumulatedPnl += pos.realizedPnl * progress;
          }
        } else {
          const duration = todayTs - openTs;
          if (duration > 0) {
            const progress = (dayTs - openTs) / duration;
            accumulatedPnl += pos.pnl * progress;
          }
        }
      }

      points.push({
        date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: Math.max(0, baseValue + accumulatedPnl),
      });
    }

    return points;
  }, [data?.data]);

  // Close single position mutation
  const closeMutation = useMutation({
    mutationFn: async (positionId: string) => {
      const res = await fetch("/api/copy/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(walletAddress && { "x-user-id": walletAddress }),
        },
        body: JSON.stringify({ positionId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to close");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success("Position closed successfully");
    },
    onError: () => {
      toast.error("Failed to close position");
    },
  });

  // Stop copying a trader (close all positions)
  const stopCopyingMutation = useMutation({
    mutationFn: async (traderId: string) => {
      const res = await fetch("/api/copy/stop-trader", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(walletAddress && { "x-user-id": walletAddress }),
        },
        body: JSON.stringify({ traderId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to stop copying");
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success(`Stopped copying trader. ${data.closedCount} position(s) closed.`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to stop copying trader");
    },
  });

  const formatPnl = (pnl: number) => {
    const sign = pnl >= 0 ? "+" : "";
    return `${sign}$${Math.abs(pnl).toFixed(2)}`;
  };

  const getPnlColor = (pnl: number) => {
    if (pnl > 0) return "text-positive";
    if (pnl < 0) return "text-negative";
    return "text-muted-foreground";
  };

  const getSideBadge = (side: string) => {
    return side === "LONG" ? (
      <span className="text-[9px] uppercase tracking-[2px] font-mono font-bold px-2 py-0.5 border border-positive/30 text-positive bg-positive/10">
        LONG
      </span>
    ) : (
      <span className="text-[9px] uppercase tracking-[2px] font-mono font-bold px-2 py-0.5 border border-negative/30 text-negative bg-negative/10">
        SHORT
      </span>
    );
  };

  const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
  };

  // Not connected — prompt wallet connection
  if (!authenticated) {
    return (
      <div className="container py-20">
        <motion.div
          className="max-w-md mx-auto text-center space-y-6"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex h-20 w-20 items-center justify-center border border-[#222] bg-[#0A0A0A] mx-auto">
            <Activity className="h-10 w-10 text-lime" />
          </div>
          <h1 className="font-display text-2xl font-black uppercase tracking-[-1px]">
            Connect Wallet
          </h1>
          <p className="text-sm text-muted-foreground font-mono leading-relaxed">
            Connect your Solana wallet to view your copy trading portfolio.
          </p>
          <Link href="/arena">
            <button className="px-6 py-2 bg-lime text-black font-mono text-[9px] uppercase tracking-[2px] font-bold hover:bg-lime/90 transition-colors">
              Browse Traders
            </button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <motion.div className="container py-8" initial="hidden" animate="visible" variants={stagger}>
        {/* Back Button */}
        <motion.div variants={fadeUp}>
          <Link
            href="/arena"
            className="inline-flex items-center text-[9px] uppercase tracking-[2px] text-muted-foreground hover:text-lime transition-colors mb-6 font-mono"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-2" />
            Back to Arena
          </Link>
        </motion.div>

        {/* Page Header */}
        <motion.div variants={fadeUp} className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground mb-1 section-prefix">
              MY PORTFOLIO
            </h1>
            <p className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono">
              Track your copy trading positions and performance
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-1.5 h-1.5 bg-lime rounded-full animate-pulse-dot" />
              <span className="text-[10px] text-lime uppercase tracking-[1px]">Auto-refresh 30s</span>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 border border-[#222] bg-[#0A0A0A] text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono hover:border-lime hover:text-lime transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </motion.div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="border border-[#222] p-6 skeleton-shimmer">
                  <div className="h-20" />
                </div>
              ))}
            </div>
            <div className="border border-[#222] p-6 skeleton-shimmer">
              <div className="h-64" />
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="border border-negative/40 bg-negative/5 p-6">
            <div className="text-center">
              <p className="text-negative mb-4 font-mono text-sm">
                Failed to load portfolio. Make sure you have copied some traders first.
              </p>
              <Link href="/arena">
                <button className="px-6 py-2 bg-lime text-black font-mono text-[9px] uppercase tracking-[2px] font-bold hover:bg-lime/90 transition-colors">
                  Browse Traders
                </button>
              </Link>
            </div>
          </div>
        )}

        {/* Empty Portfolio — guide user to Arena */}
        {data?.data && data.data.tradersCount === 0 && data.data.closedPositions.length === 0 && (
          <motion.div variants={fadeUp} className="border border-[#222] bg-[#0A0A0A] p-12">
            <div className="max-w-md mx-auto text-center space-y-6">
              <div className="flex h-20 w-20 items-center justify-center border border-[#222] bg-[#111] mx-auto">
                <Users className="h-10 w-10 text-muted-foreground opacity-40" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-foreground mb-2">
                  No Positions Yet
                </h2>
                <p className="text-sm text-muted-foreground font-mono leading-relaxed">
                  Start copy trading by browsing the Arena leaderboard. Pick a top trader, set your allocation, and your positions will appear here.
                </p>
              </div>
              <Link href="/arena">
                <button className="px-8 py-3 bg-lime text-black font-mono text-[10px] uppercase tracking-[2px] font-bold hover:bg-[#D4FF4D] transition-colors">
                  Browse Traders
                </button>
              </Link>
            </div>
          </motion.div>
        )}

        {data?.data && (data.data.tradersCount > 0 || data.data.closedPositions.length > 0) && (
          <>
            {/* Stats Cards */}
            <motion.div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
              {/* Total Value */}
              <motion.div variants={fadeUp} className="border border-[#222] bg-[#0A0A0A] p-5 group hover:border-lime/30 transition-colors card-hover">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center border border-lime/20 bg-lime-dim">
                    <DollarSign className="h-5 w-5 text-lime" />
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Total Value</div>
                    <div className="text-2xl font-display font-bold tabular-nums text-lime">
                      ${data.data.totalValue.toFixed(2)}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Allocated */}
              <motion.div variants={fadeUp} className="border border-[#222] bg-[#0A0A0A] p-5 group hover:border-ice/30 transition-colors card-hover">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center border border-ice/20 bg-ice-dim">
                    <Activity className="h-5 w-5 text-ice" />
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Allocated</div>
                    <div className="text-2xl font-display font-bold tabular-nums text-foreground">
                      ${data.data.totalAllocated.toFixed(2)}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Total PnL */}
              <motion.div variants={fadeUp} className={`border bg-[#0A0A0A] p-5 group transition-colors card-hover ${
                data.data.totalPnl >= 0 ? "border-positive/20 hover:border-positive/40" : "border-negative/20 hover:border-negative/40"
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center border ${
                    data.data.totalPnl >= 0
                      ? "border-positive/20 bg-positive/5"
                      : "border-negative/20 bg-negative/5"
                  }`}>
                    {data.data.totalPnl >= 0 ? (
                      <TrendingUp className="h-5 w-5 text-positive" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-negative" />
                    )}
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Total PnL</div>
                    <div className={`text-2xl font-display font-bold tabular-nums ${getPnlColor(data.data.totalPnl)}`}>
                      {formatPnl(data.data.totalPnl)}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Traders Count */}
              <motion.div variants={fadeUp} className="border border-[#222] bg-[#0A0A0A] p-5 group hover:border-lime/30 transition-colors card-hover">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center border border-lime/20 bg-lime-dim">
                    <Users className="h-5 w-5 text-lime" />
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Copying</div>
                    <div className="text-2xl font-display font-bold text-foreground">
                      {data.data.tradersCount} <span className="text-sm text-muted-foreground font-mono">Trader{data.data.tradersCount !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* PnL Percentage Badge */}
            <motion.div variants={fadeUp} className="mb-6">
              <span className={`inline-flex items-center px-3 py-1.5 border font-mono text-xs font-bold ${
                data.data.totalPnlPercent >= 0
                  ? "border-positive/30 text-positive bg-positive/10"
                  : "border-negative/30 text-negative bg-negative/10"
              }`}>
                {data.data.totalPnlPercent >= 0 ? "+" : ""}{data.data.totalPnlPercent.toFixed(2)}% Return
              </span>
            </motion.div>

            {/* Portfolio Performance Chart */}
            <motion.div variants={fadeUp} className="border border-[#222] bg-[#0A0A0A] mb-8">
              <div className="px-5 py-4 border-b border-[#222]">
                <h2 className="text-sm font-display font-semibold text-foreground section-prefix">
                  PORTFOLIO PERFORMANCE
                </h2>
              </div>
              <div className="p-5">
                <EquityCurve data={equityData} height={280} />
              </div>
            </motion.div>

            {/* Tabbed Section: Copied Traders + Trading History */}
            <ScrollReveal>
            <div className="border border-[#222] bg-[#0A0A0A]">
              {/* Tab Headers */}
              <div className="flex border-b border-[#222]">
                <button
                  onClick={() => setActiveTab("active")}
                  className={`flex-1 px-5 py-3 text-[9px] uppercase tracking-[2px] font-mono font-bold transition-colors relative ${
                    activeTab === "active"
                      ? "text-lime"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Copied Traders ({allTraders.length})
                  {activeTab === "active" && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-lime" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("history")}
                  className={`flex-1 px-5 py-3 text-[9px] uppercase tracking-[2px] font-mono font-bold transition-colors relative ${
                    activeTab === "history"
                      ? "text-lime"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Trading History ({closedByTrader.length})
                  {activeTab === "history" && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-lime" />
                  )}
                </button>
              </div>

              <div className="p-5">
                {/* ====== Active Copied Traders Tab ====== */}
                {activeTab === "active" && (
                  <>
                    {allTraders.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p className="font-mono text-sm mb-2">Not copying any traders yet</p>
                        <Link href="/arena">
                          <button className="text-lime text-[9px] uppercase tracking-[2px] font-mono font-bold hover:underline mt-2">
                            Browse Traders
                          </button>
                        </Link>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {paginatedTraders.map((trader) => {
                            const isExpanded = expandedTraders.has(trader.traderId);
                            return (
                              <div key={trader.traderId} className="border border-[#222] overflow-hidden">
                                {/* Trader Header */}
                                <div
                                  className="flex items-center justify-between px-4 py-3 bg-[#111] hover:bg-[#161616] cursor-pointer transition-colors"
                                  onClick={() => toggleTrader(trader.traderId)}
                                >
                                  <div className="flex items-center gap-3">
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-lime" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <div className="flex h-8 w-8 items-center justify-center border border-lime/20 bg-lime-dim text-lime font-bold text-[10px] font-mono">
                                      {(trader.displayName || trader.pacificaTraderId)?.[0]?.toUpperCase() || "T"}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-display font-semibold text-sm text-foreground">
                                          {trader.displayName || `${trader.pacificaTraderId.slice(0, 8)}...`}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground font-mono">
                                          {trader.pacificaTraderId.slice(0, 6)}...{trader.pacificaTraderId.slice(-4)}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono mt-0.5">
                                        <span>{trader.positionCount} position{trader.positionCount !== 1 ? "s" : ""}</span>
                                        <span className="text-[#333]">|</span>
                                        <span>${trader.totalAllocated.toFixed(2)} allocated</span>
                                        <span className="text-[#333]">|</span>
                                        <span className={getPnlColor(trader.totalPnl)}>
                                          {formatPnl(trader.totalPnl)} ({trader.totalPnlPercent >= 0 ? "+" : ""}{trader.totalPnlPercent.toFixed(2)}%)
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => setPnlCard({ type: "trader", trader })}
                                      title="Share PnL card"
                                      className="h-8 w-8 flex items-center justify-center border border-[#222] text-muted-foreground hover:border-lime hover:text-lime transition-colors"
                                    >
                                      <Share2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setStopConfirm({
                                        traderId: trader.traderId,
                                        name: trader.displayName || `${trader.pacificaTraderId.slice(0, 8)}...`,
                                        count: trader.positionCount,
                                      })}
                                      disabled={stopCopyingMutation.isPending}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-negative/30 bg-negative/10 text-negative text-[9px] uppercase tracking-[2px] font-mono font-bold hover:bg-negative/20 transition-colors disabled:opacity-50"
                                    >
                                      <StopCircle className="h-3.5 w-3.5" />
                                      Stop
                                    </button>
                                  </div>
                                </div>

                                {/* Expanded Positions */}
                                {isExpanded && (
                                  <div className="border-t border-[#222]">
                                    {trader.positions.map((position) => (
                                      <div
                                        key={position.id}
                                        className="flex items-center justify-between px-6 py-2.5 hover:bg-[#111] transition-colors border-b border-[#1a1a1a] last:border-b-0"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="w-4" />
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <span className="font-mono font-semibold text-sm text-foreground">{position.symbol}</span>
                                              {getSideBadge(position.side)}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-6">
                                          <div className="text-right">
                                            <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono">Size</div>
                                            <div className="text-sm font-mono tabular-nums text-foreground">{position.size.toFixed(4)}</div>
                                          </div>
                                          <div className="text-right">
                                            <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono">Entry</div>
                                            <div className="text-sm font-mono tabular-nums text-foreground">${position.entryPrice.toLocaleString()}</div>
                                          </div>
                                          <div className="text-right">
                                            <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono">Current</div>
                                            <div className="text-sm font-mono tabular-nums text-foreground">${position.currentPrice.toLocaleString()}</div>
                                          </div>
                                          <div className="text-right">
                                            <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono">PnL</div>
                                            <div className={`text-sm font-mono font-bold tabular-nums ${getPnlColor(position.pnl)}`}>
                                              {formatPnl(position.pnl)} ({position.pnlPercent.toFixed(2)}%)
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => setPnlCard({ type: "position", position })}
                                            title="Share PnL card"
                                            className="h-7 w-7 flex items-center justify-center border border-[#222] text-muted-foreground hover:border-lime hover:text-lime transition-colors"
                                          >
                                            <Share2 className="h-3 w-3" />
                                          </button>
                                          <button
                                            onClick={() => closeMutation.mutate(position.id)}
                                            disabled={closeMutation.isPending}
                                            title="Close this position"
                                            className="h-7 w-7 flex items-center justify-center border border-[#222] text-muted-foreground hover:border-negative hover:text-negative transition-colors disabled:opacity-50"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <PaginationControls
                          page={tradersPage}
                          totalPages={totalTradersPages}
                          totalItems={allTraders.length}
                          onPageChange={setTradersPage}
                        />
                      </>
                    )}
                  </>
                )}

                {/* ====== Trading History Tab ====== */}
                {activeTab === "history" && (
                  <>
                    {closedByTrader.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Activity className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p className="font-mono text-sm">No trading history yet</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {paginatedHistory.map((group) => (
                            <div
                              key={group.traderId}
                              className="flex items-center justify-between px-4 py-3 border border-[#222] bg-[#111] hover:bg-[#161616] cursor-pointer transition-colors"
                              onClick={() => setHistoryTrader(group)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center border border-ice/20 bg-ice-dim text-ice font-bold text-[10px] font-mono">
                                  {(group.displayName || group.pacificaTraderId)?.[0]?.toUpperCase() || "T"}
                                </div>
                                <div>
                                  <span className="font-display font-semibold text-sm text-foreground">
                                    {group.displayName || `${group.pacificaTraderId.slice(0, 8)}...`}
                                  </span>
                                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                    {group.positionCount} position{group.positionCount !== 1 ? "s" : ""} <span className="text-[#333]">|</span> Last closed {new Date(group.lastClosedAt).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono">Realized PnL</div>
                                  <div className={`font-mono font-bold tabular-nums ${getPnlColor(group.totalPnl)}`}>
                                    {formatPnl(group.totalPnl)}
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPnlCard({ type: "history", group });
                                  }}
                                  title="Share PnL card"
                                  className="h-8 w-8 flex items-center justify-center border border-[#222] text-muted-foreground hover:border-lime hover:text-lime transition-colors"
                                >
                                  <Share2 className="h-3.5 w-3.5" />
                                </button>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          ))}
                        </div>

                        <PaginationControls
                          page={historyPage}
                          totalPages={totalHistoryPages}
                          totalItems={closedByTrader.length}
                          onPageChange={setHistoryPage}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            </ScrollReveal>
          </>
        )}
      </motion.div>

      {/* Stop Copying Confirmation Dialog */}
      <Dialog open={!!stopConfirm} onOpenChange={(open) => !open && setStopConfirm(null)}>
        <DialogContent className="bg-[#0A0A0A] border-[#222] rounded-none max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground section-prefix">STOP COPYING</DialogTitle>
            <DialogDescription className="font-mono text-sm text-muted-foreground">
              Are you sure you want to stop copying <span className="font-bold text-foreground">{stopConfirm?.name}</span>? All {stopConfirm?.count} open position{stopConfirm?.count !== 1 ? "s" : ""} will be closed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setStopConfirm(null)}
              className="px-4 py-2 border border-[#222] bg-[#111] text-[9px] uppercase tracking-[2px] font-mono font-bold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (stopConfirm) {
                  stopCopyingMutation.mutate(stopConfirm.traderId);
                  setStopConfirm(null);
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-negative/30 bg-negative/10 text-negative text-[9px] uppercase tracking-[2px] font-mono font-bold hover:bg-negative/20 transition-colors"
            >
              <StopCircle className="h-3.5 w-3.5" />
              Stop Copying
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trading History Detail Modal */}
      <Dialog open={!!historyTrader} onOpenChange={(open) => !open && setHistoryTrader(null)}>
        <DialogContent className="bg-[#0A0A0A] border-[#222] rounded-none max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-ice/20 bg-ice-dim text-ice font-bold text-xs font-mono">
                {(historyTrader?.displayName || historyTrader?.pacificaTraderId)?.[0]?.toUpperCase() || "T"}
              </div>
              <div>
                <DialogTitle className="font-display text-foreground">
                  {historyTrader?.displayName || `${historyTrader?.pacificaTraderId.slice(0, 8)}...`}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  {historyTrader?.positionCount} closed position{historyTrader?.positionCount !== 1 ? "s" : ""} <span className="text-[#333]">|</span> Total: <span className={getPnlColor(historyTrader?.totalPnl ?? 0)}>{formatPnl(historyTrader?.totalPnl ?? 0)}</span>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 -mx-6 px-6 space-y-2">
            {historyTrader?.positions.map((pos) => (
              <div
                key={pos.id}
                className="flex items-center justify-between p-3 border border-[#222] bg-[#111]"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm text-foreground">{pos.symbol}</span>
                    {getSideBadge(pos.side)}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-1">
                    {new Date(pos.openedAt).toLocaleDateString()} → {pos.closedAt ? new Date(pos.closedAt).toLocaleDateString() : "—"}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono">Size</div>
                    <div className="text-sm font-mono tabular-nums text-foreground">{pos.size.toFixed(4)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono">Entry</div>
                    <div className="text-sm font-mono tabular-nums text-foreground">${pos.entryPrice.toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono">Realized PnL</div>
                    <div className={`text-sm font-mono font-bold tabular-nums ${getPnlColor(pos.realizedPnl)}`}>
                      {formatPnl(pos.realizedPnl)}
                    </div>
                  </div>
                  <button
                    onClick={() => setPnlCard({ type: "position", position: pos })}
                    title="Share PnL card"
                    className="h-7 w-7 flex items-center justify-center border border-[#222] text-muted-foreground hover:border-lime hover:text-lime transition-colors"
                  >
                    <Share2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* PnL Card Modal */}
      <Dialog open={!!pnlCard} onOpenChange={(open) => !open && setPnlCard(null)}>
        <DialogContent className="max-w-sm p-0 border-0 bg-transparent shadow-none rounded-none">
          <DialogHeader className="sr-only">
            <DialogTitle>PnL Card</DialogTitle>
            <DialogDescription>Share your trading performance</DialogDescription>
          </DialogHeader>
          {pnlCard && (
            <>
            <div ref={pnlCardRef} className="bg-[#0A0A0A] p-6 w-[380px] mx-auto border border-[#222] shadow-2xl">
              {/* Brand */}
              <div className="text-lg font-display font-bold mb-5">
                <span className="text-foreground">Alpha</span>
                <span className="text-lime">[Arena]</span>
              </div>

              {pnlCard.type === "position" && (
                <>
                  {/* Position variant */}
                  <div className="flex items-center gap-2 mb-6">
                    <span className="text-foreground font-mono font-bold text-lg">{pnlCard.position.symbol}</span>
                    <span className={`text-[9px] uppercase tracking-[2px] font-mono font-bold px-2 py-0.5 border ${
                      pnlCard.position.side === "LONG"
                        ? "border-positive/30 text-positive bg-positive/10"
                        : "border-negative/30 text-negative bg-negative/10"
                    }`}>
                      {pnlCard.position.side}
                    </span>
                  </div>

                  {/* Large PnL % */}
                  <div className={`text-4xl font-display font-bold tabular-nums text-center mb-6 ${
                    pnlCard.position.pnlPercent >= 0 ? "text-positive" : "text-negative"
                  }`}>
                    {pnlCard.position.pnlPercent >= 0 ? "+" : ""}{pnlCard.position.pnlPercent.toFixed(2)}%
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Entry Price</div>
                      <div className="text-sm font-mono tabular-nums text-foreground">${pnlCard.position.entryPrice.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Mark Price</div>
                      <div className="text-sm font-mono tabular-nums text-foreground">${pnlCard.position.currentPrice.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Size</div>
                      <div className="text-sm font-mono tabular-nums text-foreground">{pnlCard.position.size.toFixed(4)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">PnL</div>
                      <div className={`text-sm font-mono font-bold tabular-nums ${
                        pnlCard.position.pnl >= 0 ? "text-positive" : "text-negative"
                      }`}>
                        {pnlCard.position.pnl >= 0 ? "+" : ""}${Math.abs(pnlCard.position.pnl).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {pnlCard.type === "trader" && (
                <>
                  {/* Trader variant */}
                  <div className="mb-6">
                    <span className="text-foreground font-display font-bold text-lg">
                      {pnlCard.trader.displayName || `${pnlCard.trader.pacificaTraderId.slice(0, 8)}...`}
                    </span>
                  </div>

                  {/* Large PnL % */}
                  <div className={`text-4xl font-display font-bold tabular-nums text-center mb-6 ${
                    pnlCard.trader.totalPnlPercent >= 0 ? "text-positive" : "text-negative"
                  }`}>
                    {pnlCard.trader.totalPnlPercent >= 0 ? "+" : ""}{pnlCard.trader.totalPnlPercent.toFixed(2)}%
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Positions</div>
                      <div className="text-sm font-mono tabular-nums text-foreground">{pnlCard.trader.positionCount}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Allocated</div>
                      <div className="text-sm font-mono tabular-nums text-foreground">${pnlCard.trader.totalAllocated.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Total PnL</div>
                      <div className={`text-sm font-mono font-bold tabular-nums ${
                        pnlCard.trader.totalPnl >= 0 ? "text-positive" : "text-negative"
                      }`}>
                        {pnlCard.trader.totalPnl >= 0 ? "+" : ""}${Math.abs(pnlCard.trader.totalPnl).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Return</div>
                      <div className={`text-sm font-mono font-bold tabular-nums ${
                        pnlCard.trader.totalPnlPercent >= 0 ? "text-positive" : "text-negative"
                      }`}>
                        {pnlCard.trader.totalPnlPercent >= 0 ? "+" : ""}{pnlCard.trader.totalPnlPercent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </>
              )}

              {pnlCard.type === "history" && (() => {
                const g = pnlCard.group;
                const totalAlloc = g.positions.reduce((s, p) => s + p.allocationUsd, 0);
                const pnlPct = totalAlloc > 0 ? (g.totalPnl / totalAlloc) * 100 : 0;
                return (
                  <>
                    {/* History trader variant */}
                    <div className="mb-6">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-display font-bold text-lg">
                          {g.displayName || `${g.pacificaTraderId.slice(0, 8)}...`}
                        </span>
                        <span className="text-[9px] uppercase tracking-[2px] font-mono font-bold px-2 py-0.5 border border-muted-foreground/30 text-muted-foreground bg-muted-foreground/10">
                          CLOSED
                        </span>
                      </div>
                    </div>

                    {/* Large PnL % */}
                    <div className={`text-4xl font-display font-bold tabular-nums text-center mb-6 ${
                      pnlPct >= 0 ? "text-positive" : "text-negative"
                    }`}>
                      {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div>
                        <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Positions</div>
                        <div className="text-sm font-mono tabular-nums text-foreground">{g.positionCount}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Last Closed</div>
                        <div className="text-sm font-mono tabular-nums text-foreground">{new Date(g.lastClosedAt).toLocaleDateString()}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Realized PnL</div>
                        <div className={`text-sm font-mono font-bold tabular-nums ${
                          g.totalPnl >= 0 ? "text-positive" : "text-negative"
                        }`}>
                          {g.totalPnl >= 0 ? "+" : ""}${Math.abs(g.totalPnl).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono mb-1">Return</div>
                        <div className={`text-sm font-mono font-bold tabular-nums ${
                          pnlPct >= 0 ? "text-positive" : "text-negative"
                        }`}>
                          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Footer */}
              <div className="text-center text-[9px] uppercase tracking-[2px] text-muted-foreground font-mono pt-3 border-t border-[#222]">
                alphaarena.trade
              </div>
            </div>

            {/* Download & Share buttons (outside ref so they don't appear in screenshot) */}
            <div className="flex gap-3 w-[380px] mx-auto mt-3">
              <button
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-[#222] bg-[#111] text-[9px] uppercase tracking-[2px] font-mono font-bold text-foreground hover:border-lime hover:text-lime transition-colors"
                onClick={handleDownloadPnlCard}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
              <button
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-lime text-black text-[9px] uppercase tracking-[2px] font-mono font-bold hover:bg-lime/90 transition-colors"
                onClick={handleShareToTwitter}
              >
                <Share2 className="h-3.5 w-3.5" />
                Share to X
              </button>
            </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
