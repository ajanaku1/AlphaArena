import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pacifica } from "@/lib/pacifica-client";
import { copyTraderForUser } from "@/server/copy/copy-service";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * POST /api/arena/copy
 *
 * Auto-track a trader from the Pacifica leaderboard (if not already in DB),
 * then create a copy position for the user.
 *
 * Body: { traderAddress: string, allocationUsd: number }
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const body = await request.json();
    const { traderAddress, allocationUsd } = body;

    if (!traderAddress || typeof traderAddress !== "string") {
      return NextResponse.json(
        { error: "traderAddress is required" },
        { status: 400 }
      );
    }

    if (!allocationUsd || allocationUsd < 10) {
      return NextResponse.json(
        { error: "allocationUsd must be at least $10" },
        { status: 400 }
      );
    }

    // Find or auto-track the trader
    let trader = await prisma.trader.findUnique({
      where: { pacificaTraderId: traderAddress },
    });

    if (!trader) {
      // Auto-track: fetch from Pacifica and create Trader + Strategy records
      const [accountInfo, positions] = await Promise.all([
        pacifica.getAccountInfo(traderAddress),
        pacifica.getPositions(traderAddress),
      ]);

      if (!accountInfo) {
        return NextResponse.json(
          { error: "Trader not found on Pacifica" },
          { status: 404 }
        );
      }

      const equity = parseFloat(accountInfo.account_equity) || 0;

      trader = await prisma.trader.create({
        data: {
          pacificaTraderId: traderAddress,
          displayName: `Trader ${traderAddress.slice(0, 6)}...${traderAddress.slice(-4)}`,
          accountEquity: equity,
          positionsCount: positions.length,
          feeLevel: accountInfo.fee_level,
          lastSyncedAt: new Date(),
          firstSeenAt: new Date(),
        },
      });

      // Create Strategy records for open positions
      if (positions.length > 0) {
        await prisma.strategy.createMany({
          data: positions.map((p) => ({
            traderId: trader!.id,
            symbol: p.symbol,
            side: p.side, // "bid" or "ask"
            size: parseFloat(p.amount) || 0,
            entryPrice: parseFloat(p.entry_price) || 0,
            pnl: 0,
            margin: p.margin ? parseFloat(p.margin) : null,
            funding: parseFloat(p.funding) || 0,
            isolated: p.isolated,
            openedAt: new Date(p.created_at),
            rawData: JSON.stringify(p),
          })),
        });
      }
    }

    // Ensure the user exists (userId is wallet address from x-user-id header)
    await prisma.user.upsert({
      where: { privyId: userId },
      update: {},
      create: {
        privyId: userId,
        walletAddress: userId,
      },
    });

    // Find user to get internal id
    const user = await prisma.user.findUnique({
      where: { privyId: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Execute copy
    const result = await copyTraderForUser({
      userId: user.id,
      traderId: trader.id,
      allocationUsd,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.message, code: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      data: {
        copyPositions: result.copyPositions,
        totalAllocated: result.totalAllocated,
      },
    });
  } catch (error) {
    console.error("[Arena Copy] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    const isDbError = msg.includes("prisma") || msg.includes("database") || msg.includes("SQLITE");
    return NextResponse.json(
      {
        error: isDbError
          ? "Copy trading requires a database. This feature is coming soon on mainnet."
          : "Failed to copy trader",
        message: msg,
      },
      { status: 500 }
    );
  }
}
