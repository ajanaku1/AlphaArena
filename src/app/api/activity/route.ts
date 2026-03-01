import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/activity
 *
 * Returns recent copy-trading activity (last 48 hours, up to 20 items).
 * Used on the landing page to show the platform is alive.
 */
export async function GET() {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const positions = await prisma.copyPosition.findMany({
      where: {
        openedAt: { gte: cutoff },
      },
      orderBy: { openedAt: "desc" },
      take: 20,
      include: {
        user: {
          select: { username: true, displayName: true },
        },
        trader: {
          select: { displayName: true, pacificaTraderId: true },
        },
      },
    });

    const items = positions.map((p) => {
      const userLabel =
        p.user.username ||
        p.user.displayName ||
        `${p.userId.slice(0, 4)}...${p.userId.slice(-2)}`;
      const traderLabel =
        p.trader.displayName ||
        `${p.trader.pacificaTraderId.slice(0, 4)}...${p.trader.pacificaTraderId.slice(-2)}`;

      return {
        id: p.id,
        user: userLabel,
        trader: traderLabel,
        symbol: p.symbol,
        amount: Math.round(p.allocationUsd),
        timestamp: p.openedAt.toISOString(),
      };
    });

    return NextResponse.json({ success: true, data: items });
  } catch {
    // DB unavailable — return empty activity
    return NextResponse.json({ success: true, data: [] });
  }
}
