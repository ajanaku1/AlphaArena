import { NextRequest, NextResponse } from "next/server";
import { getActiveCompetitionWithLeaderboard } from "@/server/competition/competition-service";
import { resolveUser } from "@/lib/auth/middleware";

export const dynamic = "force-dynamic";

/**
 * GET /api/leaderboard
 *
 * Get the current Trading Royale leaderboard.
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

    return NextResponse.json({
      success: true,
      data: {
        competition: {
          id: result.competition.id,
          name: result.competition.name,
          status: result.competition.status,
          totalParticipants: result.competition.totalParticipants,
        },
        entries: result.entries.map((entry) => ({
          rank: entry.rank,
          userId: entry.userId,
          username: entry.user.username || entry.user.displayName || `Trader_${entry.userId.slice(0, 6)}`,
          avatarUrl: entry.user.avatarUrl,
          pnlPercent: entry.pnlPercent,
          pnlUsd: entry.pnlUsd,
          copiedTradersCount: entry.copiedTradersCount,
        })),
        userEntry: result.userEntry ? {
          rank: result.userEntry.rank,
          pnlPercent: result.userEntry.pnlPercent,
          pnlUsd: result.userEntry.pnlUsd,
        } : null,
      },
    });
  } catch {
    // DB unavailable — return empty leaderboard so the page still renders
    return NextResponse.json({
      success: true,
      data: {
        competition: {
          id: "placeholder",
          name: "Trading Royale",
          status: "ACTIVE",
          totalParticipants: 0,
        },
        entries: [],
        userEntry: null,
      },
    });
  }
}
