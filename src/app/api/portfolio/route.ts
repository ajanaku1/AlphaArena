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
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const portfolio = await getUserPortfolio(user.id);

    return NextResponse.json({
      success: true,
      data: portfolio,
    });
  } catch {
    // DB unavailable — return empty portfolio so the page renders
    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalAllocated: 0,
          totalPnl: 0,
          totalPnlPercent: 0,
          openPositions: 0,
          activeTraders: 0,
        },
        copiedTraders: [],
        closedPositions: [],
      },
    });
  }
}
