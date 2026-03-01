"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  ChevronLeft,
  ChevronRight,
  Users,
  DollarSign,
  AlertCircle,
  TrendingUp,
  ExternalLink,
  Loader2,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { useWallet } from "@/hooks/use-wallet";

import { ScrollReveal } from "@/components/scroll-reveal";

// ============================================================================
// Types
// ============================================================================

interface LeaderboardEntry {
  address: string;
  username: string | null;
  pnl_1d: number;
  pnl_7d: number;
  pnl_30d: number;
  pnl_all_time: number;
  equity_current: number;
  oi_current: number;
  volume_1d: number;
  volume_7d: number;
  volume_30d: number;
  volume_all_time: number;
  copierCount: number;
}

interface LeaderboardResponse {
  data: LeaderboardEntry[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  meta: {
    cachedAt: number;
    totalTraders: number;
  };
}

type SortColumn =
  | "pnl_all_time"
  | "pnl_7d"
  | "pnl_30d"
  | "pnl_1d"
  | "equity_current"
  | "volume_all_time"
  | "oi_current";

// ============================================================================
// Helpers
// ============================================================================

function formatUsd(value: number, abbreviated = false): string {
  if (abbreviated) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  }
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatPnl(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatEquity(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function pnlColor(value: number): string {
  if (value > 0) return "text-positive";
  if (value < 0) return "text-negative";
  return "text-muted-foreground";
}

// ============================================================================
// Arena Page
// ============================================================================

export default function ArenaPage() {
  const queryClient = useQueryClient();
  const { authenticated, walletAddress, login } = useWallet();

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sortBy, setSortBy] = useState<SortColumn>("pnl_all_time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [profitableOnly, setProfitableOnly] = useState(false);

  const [selectedTrader, setSelectedTrader] = useState<LeaderboardEntry | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [allocationUsd, setAllocationUsd] = useState(100);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useQuery<LeaderboardResponse>({
    queryKey: ["arena-leaderboard", { page, pageSize, sortBy, sortOrder, search, profitableOnly }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
        ...(search && { search }),
        ...(profitableOnly && { profitableOnly: "true" }),
      });
      const res = await fetch(`/api/arena/leaderboard?${params}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: accountCheck } = useQuery<{ hasPacificaAccount: boolean }>({
    queryKey: ["pacifica-account", walletAddress],
    queryFn: async () => {
      const res = await fetch(`/api/arena/check-account?address=${walletAddress}`);
      if (!res.ok) return { hasPacificaAccount: false };
      return res.json();
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
  });

  const copyMutation = useMutation({
    mutationFn: async (data: { traderAddress: string; allocationUsd: number }) => {
      const res = await fetch("/api/arena/copy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(walletAddress && { "x-user-id": walletAddress }),
        },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to copy");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arena-leaderboard"] });
      setShowCopyModal(false);
      setAllocationUsd(100);
      toast.success(
        `Now copying ${selectedTrader?.username || truncateAddress(selectedTrader?.address || "")}`,
        { description: `Allocated $${allocationUsd}` }
      );
    },
    onError: (error: Error) => {
      toast.error("Failed to copy trader", { description: error.message });
    },
  });

  const handleSort = useCallback(
    (column: SortColumn) => {
      if (sortBy === column) {
        setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
      } else {
        setSortBy(column);
        setSortOrder("desc");
      }
      setPage(1);
    },
    [sortBy]
  );

  const handleCopyClick = (entry: LeaderboardEntry) => {
    setSelectedTrader(entry);
    setAllocationUsd(100);
    setShowCopyModal(true);
  };

  const handleConfirmCopy = () => {
    if (!selectedTrader) return;
    copyMutation.mutate({
      traderAddress: selectedTrader.address,
      allocationUsd,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Address copied to clipboard");
  };

  const getCopyButtonState = (): { disabled: boolean; label: string } => {
    if (!authenticated) return { disabled: true, label: "Connect" };
    if (accountCheck && !accountCheck.hasPacificaAccount)
      return { disabled: true, label: "No Account" };
    return { disabled: false, label: "Copy" };
  };

  const copyBtnState = getCopyButtonState();

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortBy !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortOrder === "desc" ? (
      <ArrowDown className="h-3 w-3 ml-1 text-lime" />
    ) : (
      <ArrowUp className="h-3 w-3 ml-1 text-lime" />
    );
  };

  const pagination = data?.pagination;
  const startItem = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = pagination
    ? Math.min(pagination.page * pagination.pageSize, pagination.totalItems)
    : 0;

  const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
  };

  return (
    <>
      <div className="min-h-screen bg-background">
        <motion.div className="container py-8" initial="hidden" animate="visible" variants={stagger}>
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight mb-1">Trader Arena</h1>
              <p className="text-xs text-muted-foreground uppercase tracking-[1px]">
                Full Pacifica testnet leaderboard &mdash; copy-trade any wallet
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-1.5 h-1.5 bg-positive rounded-full animate-pulse-dot" />
                <span className="text-[10px] text-positive uppercase tracking-[1px]">Live Data</span>
              </div>
            </div>
            {data?.meta && (
              <div className="flex items-center gap-2 px-3 py-1.5 border border-[#222] bg-[#0A0A0A]">
                <Users className="h-3.5 w-3.5 text-lime" />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {data.meta.totalTraders.toLocaleString()} traders
                </span>
              </div>
            )}
          </motion.div>

          {/* Pacifica account banner */}
          {authenticated && accountCheck && !accountCheck.hasPacificaAccount && (
            <motion.div variants={fadeUp} className="mb-6 p-4 border border-[#FFD700]/30 bg-[#FFD700]/5">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-[#FFD700] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-[#FFD700] uppercase tracking-[1px]">
                    Pacifica testnet account required
                  </p>
                  <p className="text-xs text-[#FFD700]/70 mt-1">
                    You need a Pacifica testnet account to copy-trade.{" "}
                    <a
                      href="https://test-app.pacifica.fi"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-[#FFD700]"
                    >
                      Create one here
                      <ExternalLink className="h-3 w-3 inline ml-1" />
                    </a>
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Filter bar */}
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by address or username..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[#0A0A0A] border border-[#222] text-xs focus:outline-none focus:border-lime/50 focus:ring-1 focus:ring-lime/20 placeholder:text-muted-foreground transition-colors"
              />
            </div>
            <button
              onClick={() => {
                setProfitableOnly(!profitableOnly);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-4 py-2 text-[10px] font-semibold uppercase tracking-[1.5px] border transition-colors ${
                profitableOnly
                  ? "border-lime bg-lime-dim text-lime"
                  : "border-[#222] text-muted-foreground hover:text-foreground hover:border-[#333]"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Profitable Only
            </button>
          </motion.div>

          {/* Error state & Table */}
          <motion.div variants={fadeUp}>
          {error && (
            <div className="text-center py-12 border border-negative/40 bg-negative/5">
              <p className="text-negative text-xs uppercase tracking-[1px] mb-4">
                Failed to load leaderboard
              </p>
              <button
                onClick={() => refetch()}
                className="px-6 py-2 border border-[#333] text-xs uppercase tracking-[1px] hover:border-foreground transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Table */}
          {!error && (
            <div className="border border-[#222] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#111] border-b border-[#222]">
                    <th className="text-left px-4 py-2.5 text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium w-14">#</th>
                    <th className="text-left px-4 py-2.5 text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium min-w-[160px]">Trader</th>
                    <th className="text-left px-4 py-2.5 text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("pnl_all_time")}>
                      <div className="flex items-center">All-Time PnL <SortIcon column="pnl_all_time" /></div>
                    </th>
                    <th className="text-left px-4 py-2.5 text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("pnl_7d")}>
                      <div className="flex items-center">7d PnL <SortIcon column="pnl_7d" /></div>
                    </th>
                    <th className="text-left px-4 py-2.5 text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("equity_current")}>
                      <div className="flex items-center">Equity <SortIcon column="equity_current" /></div>
                    </th>
                    <th className="text-left px-4 py-2.5 text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground transition-colors hidden lg:table-cell" onClick={() => handleSort("volume_all_time")}>
                      <div className="flex items-center">Volume <SortIcon column="volume_all_time" /></div>
                    </th>
                    <th className="text-left px-4 py-2.5 text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium hidden lg:table-cell">Copiers</th>
                    <th className="text-right px-4 py-2.5 text-[9px] uppercase tracking-[2px] text-muted-foreground font-medium w-24">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading &&
                    [...Array(pageSize)].map((_, i) => (
                      <tr key={i} className="border-b border-[#222]">
                        <td className="px-4 py-3"><div className="h-3 w-8 skeleton-shimmer" /></td>
                        <td className="px-4 py-3"><div className="h-3 w-28 skeleton-shimmer" /></td>
                        <td className="px-4 py-3"><div className="h-3 w-20 skeleton-shimmer" /></td>
                        <td className="px-4 py-3"><div className="h-3 w-16 skeleton-shimmer" /></td>
                        <td className="px-4 py-3"><div className="h-3 w-16 skeleton-shimmer" /></td>
                        <td className="px-4 py-3 hidden lg:table-cell"><div className="h-3 w-16 skeleton-shimmer" /></td>
                        <td className="px-4 py-3 hidden lg:table-cell"><div className="h-3 w-10 skeleton-shimmer" /></td>
                        <td className="px-4 py-3"><div className="h-6 w-14 skeleton-shimmer ml-auto" /></td>
                      </tr>
                    ))}

                  {!isLoading &&
                    data?.data.map((entry, index) => {
                      const rank = startItem + index;
                      return (
                        <tr key={entry.address} className="border-b border-[#222] hover:bg-[#0A0A0A] hover:translate-x-0.5 transition-all">
                          <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">#{rank}</td>
                          <td className="px-4 py-3">
                            <div>
                              {entry.username && (
                                <div className="text-xs font-semibold">{entry.username}</div>
                              )}
                              <button
                                onClick={() => copyToClipboard(entry.address)}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground font-mono group"
                              >
                                {truncateAddress(entry.address)}
                                <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            </div>
                          </td>
                          <td className={`px-4 py-3 text-xs font-semibold tabular-nums ${pnlColor(entry.pnl_all_time)}`}>
                            {formatPnl(entry.pnl_all_time)}
                          </td>
                          <td className={`px-4 py-3 text-xs font-medium tabular-nums ${pnlColor(entry.pnl_7d)}`}>
                            {formatPnl(entry.pnl_7d)}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium tabular-nums">
                            {formatEquity(entry.equity_current)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums hidden lg:table-cell">
                            {formatUsd(entry.volume_all_time, true)}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {entry.copierCount > 0 ? (
                              <span className="text-xs text-muted-foreground tabular-nums">{entry.copierCount}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              disabled={copyBtnState.disabled}
                              onClick={() => {
                                if (!authenticated) { login(); return; }
                                handleCopyClick(entry);
                              }}
                              className={`text-[10px] font-semibold uppercase tracking-[1px] px-3 py-1.5 border transition-colors ${
                                copyBtnState.disabled
                                  ? "border-[#222] text-muted-foreground cursor-not-allowed"
                                  : "border-lime text-lime hover:bg-lime hover:text-black"
                              }`}
                            >
                              {copyBtnState.label}
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                  {!isLoading && data?.data.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12">
                        <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-xs text-muted-foreground uppercase tracking-[1px]">
                          {search ? "No traders match your search" : "No traders found"}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          </motion.div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <ScrollReveal>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-[1px] tabular-nums">
                Showing {startItem}&ndash;{endItem} of {pagination.totalItems.toLocaleString()}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 border border-[#222] text-muted-foreground hover:text-foreground hover:border-[#333] disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {generatePageNumbers(page, pagination.totalPages).map((p, i) => {
                  if (p === "...") {
                    return <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-xs">...</span>;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`w-8 h-8 text-xs border transition-colors ${
                        page === p
                          ? "border-lime bg-lime-dim text-lime"
                          : "border-[#222] text-muted-foreground hover:text-foreground hover:border-[#333]"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="p-2 border border-[#222] text-muted-foreground hover:text-foreground hover:border-[#333] disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            </ScrollReveal>
          )}
        </motion.div>
      </div>

      {/* Copy Modal */}
      <Dialog open={showCopyModal} onOpenChange={setShowCopyModal}>
        <DialogContent className="bg-[#0A0A0A] border-[#222] rounded-none">
          <DialogHeader>
            <DialogTitle className="font-display font-bold">
              Copy {selectedTrader?.username || "Trader"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Allocate funds to copy this trader&apos;s positions proportionally.
            </DialogDescription>
          </DialogHeader>

          {selectedTrader && (
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-between p-3 bg-[#111] border border-[#222]">
                <div>
                  <div className="text-sm font-semibold">
                    {selectedTrader.username || truncateAddress(selectedTrader.address)}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {truncateAddress(selectedTrader.address)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${pnlColor(selectedTrader.pnl_all_time)}`}>
                    {formatPnl(selectedTrader.pnl_all_time)}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-[1px]">All-time PnL</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="allocation" className="text-[10px] uppercase tracking-[1.5px] text-muted-foreground">Allocation (USD)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    id="allocation"
                    type="number"
                    min="10"
                    value={allocationUsd}
                    onChange={(e) => setAllocationUsd(Number(e.target.value))}
                    className="pl-9 bg-[#111] border-[#222] rounded-none"
                  />
                </div>
                <div className="flex gap-2">
                  {[100, 500, 1000].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setAllocationUsd(amount)}
                      className="flex-1 py-1.5 border border-[#222] text-xs text-muted-foreground hover:text-foreground hover:border-[#333] transition-colors"
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-ice-dim border border-ice/20">
                <div className="flex items-start gap-2">
                  <Zap className="h-3.5 w-3.5 text-ice mt-0.5" />
                  <p className="text-[10px] text-ice/80">
                    Trading on Pacifica devnet. Positions are tracked in real-time.
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <button
              onClick={() => setShowCopyModal(false)}
              className="px-6 py-2 border border-[#222] text-xs text-muted-foreground uppercase tracking-[1px] hover:text-foreground hover:border-[#333] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmCopy}
              disabled={copyMutation.isPending || allocationUsd < 10}
              className="px-6 py-2 bg-lime text-black text-xs font-bold uppercase tracking-[1px] hover:bg-[#D4FF4D] disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {copyMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Copying...
                </>
              ) : (
                "Confirm Copy"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function generatePageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}
