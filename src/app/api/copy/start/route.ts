import { NextRequest, NextResponse } from "next/server";
import { copyTraderForUser } from "@/server/copy/copy-service";
import { requireAuthAndResolve } from "@/lib/auth/middleware";
import { checkAndAwardFirstTradeBonus } from "@/server/referral/referral-service";

/**
 * POST /api/copy/start
 *
 * Start copying a trader's positions.
 *
 * Requires authentication.
 *
 * Body:
 * {
 *   traderId: string,
 *   allocationUsd: number,
 *   stopLoss?: number,
 *   takeProfit?: number,
 *   leverage?: number
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication and resolve wallet → internal user
    const authResult = await requireAuthAndResolve(request);
    if (authResult instanceof NextResponse) return authResult;

    const { userId } = authResult;

    const body = await request.json();
    const {
      traderId,
      allocationUsd,
      stopLoss,
      takeProfit,
      leverage,
    } = body;

    // Validate required fields
    if (!traderId) {
      return NextResponse.json(
        { error: "traderId is required" },
        { status: 400 }
      );
    }

    if (!allocationUsd || allocationUsd <= 0) {
      return NextResponse.json(
        { error: "allocationUsd must be a positive number" },
        { status: 400 }
      );
    }

    // Execute copy
    const result = await copyTraderForUser({
      userId,
      traderId,
      allocationUsd,
      stopLoss,
      takeProfit,
      leverage,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.message, code: result.error },
        { status: 400 }
      );
    }

    // Award first-trade referral bonus (non-blocking)
    checkAndAwardFirstTradeBonus(userId).catch((err) =>
      console.error("[Referral] First trade bonus check failed:", err)
    );

    return NextResponse.json({
      success: true,
      message: result.message,
      data: {
        copyPositions: result.copyPositions,
        totalAllocated: result.totalAllocated,
      },
    });
  } catch (error) {
    console.error("Error starting copy:", error);

    return NextResponse.json(
      {
        error: "Failed to start copy trading",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
