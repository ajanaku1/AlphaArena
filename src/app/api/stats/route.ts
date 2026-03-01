import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [traderCount, userCount, positionCount, competitionCount, totalVolume, totalPrizes] =
      await Promise.all([
        prisma.trader.count(),
        prisma.user.count(),
        prisma.copyPosition.count(),
        prisma.competition.count(),
        prisma.copyPosition.aggregate({ _sum: { allocationUsd: true } }),
        prisma.leaderboardEntry.aggregate({ _sum: { prizeWon: true } }),
      ]);

    return NextResponse.json({
      success: true,
      data: {
        totalTraders: traderCount,
        totalUsers: userCount,
        totalPositions: positionCount,
        totalCompetitions: competitionCount,
        totalVolume: totalVolume._sum.allocationUsd || 0,
        totalPrizes: totalPrizes._sum.prizeWon || 0,
      },
    });
  } catch {
    // DB unavailable — return zeros so the page still renders
    return NextResponse.json({
      success: true,
      data: {
        totalTraders: 0,
        totalUsers: 0,
        totalPositions: 0,
        totalCompetitions: 0,
        totalVolume: 0,
        totalPrizes: 0,
      },
    });
  }
}
