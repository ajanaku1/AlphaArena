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
  } catch {
    // DB unavailable — return empty stats with a generated referral code
    const walletAddress = request.headers.get("x-user-id") || "unknown";
    const code = `ALPHA-${walletAddress.slice(0, 8).toUpperCase()}`;

    return NextResponse.json({
      success: true,
      data: {
        referralCode: code,
        referralPoints: 0,
        totalReferrals: 0,
        activeReferrals: 0,
        recentReferrals: [],
      },
    });
  }
}
