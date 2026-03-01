import { NextRequest, NextResponse } from "next/server";
import { getReferralLeaderboard } from "@/server/referral/referral-service";

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
  } catch (error) {
    console.error("Error fetching referral leaderboard:", error);
    
    return NextResponse.json(
      {
        error: "Failed to fetch referral leaderboard",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
