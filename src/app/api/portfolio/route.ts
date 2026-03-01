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
  } catch (error) {
    console.error("Error fetching portfolio:", error);
    
    return NextResponse.json(
      {
        error: "Failed to fetch portfolio",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
