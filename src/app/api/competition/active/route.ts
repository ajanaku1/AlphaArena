import { NextRequest, NextResponse } from "next/server";
import { getActiveCompetitionWithLeaderboard } from "@/server/competition/competition-service";
import { resolveUser } from "@/lib/auth/middleware";

/**
 * GET /api/competition/active
 *
 * Get the active Trading Royale competition with leaderboard.
 *
 * Query params:
 * - limit: number (default: 50, max: 100)
 *
 * Headers:
 * - x-user-id: wallet address (optional, for getting user's rank)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || "50")),
      100
    );

    // Optionally resolve wallet address to internal user ID
    let userId: string | undefined;
    const walletAddress = request.headers.get("x-user-id");
    if (walletAddress) {
      const resolved = await resolveUser(walletAddress);
      if (resolved.valid && resolved.user) {
        userId = resolved.user.id;
      }
    }

    const result = await getActiveCompetitionWithLeaderboard(limit, userId);

    // Calculate time remaining
    const now = new Date();
    const endAt = new Date(result.competition.endAt);
    const timeRemaining = endAt.getTime() - now.getTime();

    return NextResponse.json({
      success: true,
      data: {
        competition: {
          id: result.competition.id,
          name: result.competition.name,
          description: result.competition.description,
          startAt: result.competition.startAt.toISOString(),
          endAt: result.competition.endAt.toISOString(),
          status: result.competition.status,
          prizePool: result.competition.prizePool,
          firstPlacePrize: result.competition.firstPlacePrize,
          secondPlacePrize: result.competition.secondPlacePrize,
          thirdPlacePrize: result.competition.thirdPlacePrize,
          totalParticipants: result.competition.totalParticipants,
          timeRemainingMs: Math.max(0, timeRemaining),
        },
        leaderboard: result.entries.map((entry) => ({
          rank: entry.rank,
          userId: entry.userId,
          username: entry.user.username || entry.user.displayName || `Trader_${entry.userId.slice(0, 6)}`,
          avatarUrl: entry.user.avatarUrl,
          pnlPercent: entry.pnlPercent,
          pnlUsd: entry.pnlUsd,
          totalAllocated: entry.totalAllocated,
          copiedTradersCount: entry.copiedTradersCount,
          prizeWon: entry.prizeWon,
        })),
        userEntry: result.userEntry ? {
          rank: result.userEntry.rank,
          pnlPercent: result.userEntry.pnlPercent,
          pnlUsd: result.userEntry.pnlUsd,
          totalAllocated: result.userEntry.totalAllocated,
          copiedTradersCount: result.userEntry.copiedTradersCount,
        } : null,
      },
    });
  } catch (error) {
    console.error("Error fetching active competition:", error);
    
    return NextResponse.json(
      {
        error: "Failed to fetch competition",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
