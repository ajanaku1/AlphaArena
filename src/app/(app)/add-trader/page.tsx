"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";

import {
  TrendingUp,
  Plus,
  Trash2,
  ExternalLink,
  Users,
  Activity,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface TrackedTrader {
  id: string;
  pacificaTraderId: string;
  displayName: string | null;
  avatarUrl: string | null;
  totalPnl: number;
  winRate: number;
  accountEquity: number;
  positionsCount: number;
  totalCopiers: number;
  lastSyncedAt: string;
}

// ============================================================================
// Add Trader Page
// ============================================================================

export default function AddTraderPage() {
  const queryClient = useQueryClient();
  const [walletAddress, setWalletAddress] = useState("");
  const [error, setError] = useState("");

  // Fetch tracked traders
  const { data, isLoading, refetch } = useQuery<{ traders: TrackedTrader[] }>({
    queryKey: ["tracked-traders"],
    queryFn: async () => {
      const res = await fetch("/api/traders?limit=50");
      if (!res.ok) throw new Error("Failed to fetch traders");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Add trader mutation
  const addTraderMutation = useMutation({
    mutationFn: async (address: string) => {
      const res = await fetch("/api/traders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to add trader");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracked-traders"] });
      setWalletAddress("");
      setError("");
      toast.success("Trader added successfully");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  // Remove trader mutation
  const removeTraderMutation = useMutation({
    mutationFn: async (traderId: string) => {
      const res = await fetch("/api/traders/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traderId }),
      });
      if (!res.ok) throw new Error("Failed to remove trader");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracked-traders"] });
      toast.success("Trader removed");
    },
  });

  const handleAddTrader = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate wallet address (basic validation)
    const trimmed = walletAddress.trim();
    if (!trimmed) {
      setError("Please enter a wallet address");
      return;
    }

    if (trimmed.length < 10) {
      setError("Invalid wallet address");
      return;
    }

    addTraderMutation.mutate(trimmed);
  };

  const formatPnl = (pnl: number) => {
    const sign = pnl >= 0 ? "+" : "";
    return `${sign}${pnl.toFixed(2)}%`;
  };

  const getPnlColor = (pnl: number) => {
    if (pnl > 0) return "text-emerald-500";
    if (pnl < 0) return "text-red-500";
    return "text-muted-foreground";
  };

  return (
      <div className="container py-8">
        {/* Back Button */}
        <Link href="/arena" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Arena
        </Link>

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Track Traders</h1>
            <p className="text-muted-foreground">
              Add Pacifica trader wallet addresses to track their positions
            </p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Add Trader Form */}
        <Card className="mb-8 border-[#61d7ef]/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-[#61d7ef]" />
              Add Trader
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddTrader} className="flex gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="wallet">Pacifica Wallet Address</Label>
                <Input
                  id="wallet"
                  placeholder="e.g., 7xK9mN2pQrS8tUvWxYz..."
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  disabled={addTraderMutation.isPending}
                />
                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-500">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                )}
              </div>
              <Button 
                type="submit" 
                disabled={addTraderMutation.isPending || !walletAddress.trim()}
              >
                {addTraderMutation.isPending ? "Adding..." : "Add Trader"}
              </Button>
            </form>
            <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
                <div className="text-sm text-blue-500">
                  <p className="font-medium mb-1">How to find trader addresses</p>
                  <p className="text-blue-500/80">
                    Go to{" "}
                    <a 
                      href="https://app.pacifica.fi/leaders" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="underline hover:text-blue-400"
                    >
                      Pacifica Leaders
                    </a>
                    , click on a trader, and copy their wallet address from the URL or profile.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tracked Traders List */}
        <Card className="border-border/40">
          <CardHeader className="border-b border-border/40">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#61d7ef]" />
                Tracked Traders ({data?.traders?.length || 0})
              </CardTitle>
              <Badge variant="secondary">
                <Activity className="h-3 w-3 mr-1" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && (
              <div className="divide-y divide-border/40">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="p-4 animate-pulse">
                    <div className="h-16 bg-muted rounded" />
                  </div>
                ))}
              </div>
            )}

            {!isLoading && (!data?.traders || data.traders.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="mb-2">No traders tracked yet</p>
                <p className="text-sm">Add a Pacifica trader wallet address above</p>
              </div>
            )}

            {data?.traders && data.traders.length > 0 && (
              <div className="divide-y divide-border/40">
                {data.traders.map((trader) => (
                  <div
                    key={trader.id}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <Avatar
                        src={trader.avatarUrl || undefined}
                        fallback={trader.displayName?.[0] || "T"}
                        className="h-12 w-12"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {trader.displayName || trader.pacificaTraderId.slice(0, 12)}...
                          </span>
                          <a
                            href={`https://app.pacifica.fi/trader/${trader.pacificaTraderId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {trader.pacificaTraderId.slice(0, 10)}...{trader.pacificaTraderId.slice(-8)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">PnL</div>
                        <div className={`font-semibold ${getPnlColor(trader.totalPnl)}`}>
                          {formatPnl(trader.totalPnl)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Win Rate</div>
                        <div className="font-semibold">{trader.winRate.toFixed(1)}%</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Equity</div>
                        <div className="font-semibold">
                          ${trader.accountEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Positions</div>
                        <div className="font-semibold">{trader.positionsCount}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTraderMutation.mutate(trader.id)}
                        disabled={removeTraderMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
