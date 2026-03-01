import { NextRequest, NextResponse } from "next/server";
import { closeCopyPosition } from "@/server/copy/copy-service";
import { requireAuthAndResolve } from "@/lib/auth/middleware";

/**
 * POST /api/copy/close
 *
 * Close a copy position.
 *
 * Requires authentication via x-user-id header.
 *
 * Body:
 * {
 *   positionId: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthAndResolve(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const body = await request.json();
    const { positionId } = body;

    if (!positionId) {
      return NextResponse.json(
        { error: "positionId is required" },
        { status: 400 }
      );
    }

    const result = await closeCopyPosition(userId, positionId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      data: {
        realizedPnl: result.realizedPnl,
      },
    });
  } catch (error) {
    console.error("Error closing position:", error);

    return NextResponse.json(
      {
        error: "Failed to close position",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
