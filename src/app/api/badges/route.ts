import { NextRequest, NextResponse } from "next/server";
import { getUserBadges, getUserBadgeCounts } from "@/server/competition/competition-service";
import { requireAuthAndResolve } from "@/lib/auth/middleware";

/**
 * GET /api/badges
 *
 * Get user's earned badges.
 *
 * Headers:
 * - x-user-id: wallet address (required)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuthAndResolve(request);
    if (authResult instanceof NextResponse) return authResult;

    const { userId } = authResult;

    const [badges, counts] = await Promise.all([
      getUserBadges(userId),
      getUserBadgeCounts(userId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        badges: badges.map((badge) => ({
          id: badge.id,
          type: badge.type,
          competition: badge.competition ? {
            id: badge.competition.id,
            name: badge.competition.name,
            endAt: badge.competition.endAt.toISOString(),
          } : null,
          createdAt: badge.createdAt.toISOString(),
          metadata: badge.metadata ? JSON.parse(badge.metadata) : null,
        })),
        counts,
      },
    });
  } catch (error) {
    console.error("Error fetching badges:", error);
    
    return NextResponse.json(
      {
        error: "Failed to fetch badges",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
