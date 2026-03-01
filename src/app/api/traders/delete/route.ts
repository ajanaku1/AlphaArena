import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * DELETE /api/traders/delete
 *
 * Remove a tracked trader.
 *
 * Requires authentication via x-user-id header.
 *
 * Body:
 * {
 *   traderId: string
 * }
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { traderId } = body;

    if (!traderId) {
      return NextResponse.json(
        { error: "traderId is required" },
        { status: 400 }
      );
    }

    // Delete trader (cascade will delete strategies)
    await prisma.trader.delete({
      where: { id: traderId },
    });

    return NextResponse.json({
      success: true,
      message: "Trader removed successfully",
    });
  } catch (error) {
    console.error("Error removing trader:", error);
    return NextResponse.json(
      {
        error: "Failed to remove trader",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
