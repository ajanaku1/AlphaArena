import { NextRequest, NextResponse } from "next/server";
import { getReferralStats, ensureReferralCode } from "@/server/referral/referral-service";
import { requireAuthAndResolve } from "@/lib/auth/middleware";

/**
 * GET /api/referrals/me
 *
 * Get current user's referral stats.
 *
 * Requires authentication.
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication and resolve wallet → internal user
    const authResult = await requireAuthAndResolve(request);
    if (authResult instanceof NextResponse) return authResult;

    const { userId } = authResult;

    // Ensure user has a referral code
    await ensureReferralCode(userId);

    const stats = await getReferralStats(userId);

    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        recentReferrals: stats.recentReferrals.map((r) => ({
          id: r.id,
          referredUser: {
            id: r.referredUser.id,
            username: r.referredUser.username || r.referredUser.displayName || "Anonymous",
            avatarUrl: r.referredUser.avatarUrl,
          },
          pointsAwarded: r.pointsAwarded,
          source: r.source,
          createdAt: r.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching referral stats:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch referral stats",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
