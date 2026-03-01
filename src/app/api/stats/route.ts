import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
