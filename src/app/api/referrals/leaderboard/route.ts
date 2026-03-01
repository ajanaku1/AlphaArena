import { NextRequest, NextResponse } from "next/server";
import { getReferralLeaderboard } from "@/server/referral/referral-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/referrals/leaderboard
 * 
 * Get referral leaderboard sorted by points.
 * 
 * Query params:
 * - limit: number (default: 50, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || "50")),
      100
    );

    const leaderboard = await getReferralLeaderboard(limit);

    return NextResponse.json({
      success: true,
      data: leaderboard,
    });
  } catch {
    // DB unavailable — return empty leaderboard
    return NextResponse.json({
      success: true,
      data: [],
    });
  }
}
