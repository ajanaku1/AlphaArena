/**
 * Auth Middleware Helper
 *
 * Utilities for protecting API routes.
 * The frontend sends the Solana wallet address as the x-user-id header.
 * This module resolves that wallet address to the internal user record.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Extract the wallet address from the request header.
 * Returns 401 if no header is present.
 */
export function requireAuth(
  request: NextRequest
): { userId: string } | NextResponse {
  const userId = request.headers.get("x-user-id");

  if (!userId || userId.length === 0) {
    return NextResponse.json(
      { error: "Authentication required. Connect your wallet to continue." },
      { status: 401 }
    );
  }

  return { userId };
}

/**
 * Resolve a wallet address (from x-user-id header) to the internal DB user.
 * Looks up by privyId (which stores the wallet address).
 * Returns the full user id + privyId or an error.
 */
export async function resolveUser(walletAddress: string): Promise<{
  valid: boolean;
  user?: { id: string; privyId: string };
  error?: string;
}> {
  if (!walletAddress || walletAddress.length === 0) {
    return { valid: false, error: "Invalid wallet address" };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { privyId: walletAddress },
      select: { id: true, privyId: true },
    });

    if (!user) {
      // User not in DB — use wallet address as fallback identity
      return { valid: true, user: { id: walletAddress, privyId: walletAddress } };
    }

    return { valid: true, user };
  } catch {
    // DB unavailable — use wallet address as fallback identity
    return { valid: true, user: { id: walletAddress, privyId: walletAddress } };
  }
}

/**
 * Combined helper: extract wallet from header + resolve to DB user.
 * Returns the internal user id or a 401 response.
 */
export async function requireAuthAndResolve(
  request: NextRequest
): Promise<{ userId: string; walletAddress: string } | NextResponse> {
  const authResult = requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { userId: walletAddress } = authResult;
  const resolved = await resolveUser(walletAddress);

  if (!resolved.valid || !resolved.user) {
    return NextResponse.json(
      { error: resolved.error || "User not found" },
      { status: 401 }
    );
  }

  return { userId: resolved.user.id, walletAddress };
}
