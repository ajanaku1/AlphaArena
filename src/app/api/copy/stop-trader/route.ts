import { NextRequest, NextResponse } from "next/server";
import { requireAuthAndResolve } from "@/lib/auth/middleware";
import { stopCopyingTrader } from "@/server/copy/copy-service";

/**
 * POST /api/copy/stop-trader
 *
 * Stop copying a trader - closes all open positions for that trader.
 *
 * Requires authentication via x-user-id header.
 *
 * Body: { traderId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthAndResolve(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const body = await request.json();
    const { traderId } = body;

    if (!traderId || typeof traderId !== "string") {
      return NextResponse.json(
        { error: "traderId is required" },
        { status: 400 }
      );
    }

    const result = await stopCopyingTrader(userId, traderId);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Some positions failed to close",
          closedCount: result.closedCount,
          errors: result.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      closedCount: result.closedCount,
      totalRealizedPnl: result.totalRealizedPnl,
    });
  } catch (error) {
    console.error("[StopTrader] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to stop copying trader",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
