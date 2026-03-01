import { NextRequest, NextResponse } from "next/server";
import { getUserPortfolio } from "@/server/copy/copy-service";
import { requireAuth } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/portfolio
 *
 * Get user's copy trading portfolio.
 *
 * Requires authentication.
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { userId: privyId } = authResult;

    // Resolve internal user ID from privyId/wallet address
    const user = await prisma.user.findUnique({
      where: { privyId },
    });

    if (!user) {
      // User hasn't synced yet — return empty portfolio
      return NextResponse.json({
        success: true,
        data: {
          totalValue: 0,
          totalAllocated: 0,
          totalPnl: 0,
          totalPnlPercent: 0,
          openPositions: [],
          closedPositions: [],
          copiedTraders: [],
          tradersCount: 0,
        },
      });
    }

    const portfolio = await getUserPortfolio(user.id);

    return NextResponse.json({
      success: true,
      data: portfolio,
    });
  } catch {
    // DB unavailable or user not found — return empty portfolio so the page renders
    return NextResponse.json({
      success: true,
      data: {
        totalValue: 0,
        totalAllocated: 0,
        totalPnl: 0,
        totalPnlPercent: 0,
        openPositions: [],
        closedPositions: [],
        copiedTraders: [],
        tradersCount: 0,
      },
    });
  }
}
