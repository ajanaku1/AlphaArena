"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState, useCallback } from "react";
import { identifyFuulUser } from "@/lib/fuul";
import { getStoredReferralCode } from "@/lib/fuul";

// ============================================================================
// Types
// ============================================================================

export interface DbUser {
  id: string;
  privyId: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  referralCode: string | null;
  referralPoints: number;
  totalPnl: number;
  totalAllocated: number;
  createdAt: string;
}

export interface UseCurrentUserResult {
  user: DbUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
}

// ============================================================================
// Auth Hook
// ============================================================================

/**
 * useCurrentUser hook
 *
 * - Reads Solana wallet connection
 * - Syncs with backend (upserts user)
 * - Identifies user with Fuul for referral attribution
 * - Auto-applies stored referral codes on signup
 * - Returns cached user with proper loading states
 */
export function useCurrentUser(): UseCurrentUserResult {
  const { publicKey, connected } = useWallet();
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncedAddress, setSyncedAddress] = useState<string | null>(null);

  const walletAddress = publicKey?.toBase58() ?? null;

  // Sync user to database
  const syncUser = useCallback(async () => {
    if (!connected || !walletAddress) {
      setDbUser(null);
      setIsLoading(false);
      return;
    }

    // Prevent duplicate syncs for same wallet
    if (syncedAddress === walletAddress) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Identify user with Fuul for referral attribution
      identifyFuulUser(walletAddress);

      // Check for stored referral code from URL params
      const storedReferralCode = getStoredReferralCode(true);

      // Call backend to upsert user
      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privyUserId: walletAddress,
          walletAddress,
          email: null,
          displayName: null,
          avatarUrl: null,
          referralCode: storedReferralCode,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to sync user");
      }

      const data = await response.json();
      setDbUser(data.user);
      setSyncedAddress(walletAddress);
    } catch (error) {
      console.error("Error syncing user:", error);
      setDbUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [connected, walletAddress, syncedAddress]);

  // Sync when wallet connection changes
  useEffect(() => {
    syncUser();
  }, [syncUser]);

  // Refresh function
  const refresh = useCallback(async () => {
    if (connected && walletAddress) {
      setSyncedAddress(null);
      await syncUser();
    }
  }, [connected, walletAddress, syncUser]);

  return {
    user: dbUser,
    isLoading,
    isAuthenticated: connected && !!dbUser,
    refresh,
  };
}
