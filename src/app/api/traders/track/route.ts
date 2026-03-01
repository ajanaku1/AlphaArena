import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pacifica } from "@/lib/pacifica-client";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * POST /api/traders/track
 *
 * Add a trader to track by wallet address.
 *
 * Requires authentication via x-user-id header.
 *
 * Body:
 * {
 *   walletAddress: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress || walletAddress.trim().length === 0) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    const trimmedAddress = walletAddress.trim();

    // Check if trader already exists
    const existingTrader = await prisma.trader.findUnique({
      where: { pacificaTraderId: trimmedAddress },
    });

    if (existingTrader) {
      return NextResponse.json({
        success: true,
        message: "Trader already being tracked",
        trader: existingTrader,
      });
    }

    // Fetch trader data from Pacifica
    try {
      const accountInfo = await pacifica.getAccountInfo(trimmedAddress);
      
      if (!accountInfo) {
        return NextResponse.json(
          { error: "Invalid trader address - not found on Pacifica" },
          { status: 404 }
        );
      }

      // Create trader in database
      const trader = await prisma.trader.create({
        data: {
          pacificaTraderId: trimmedAddress,
          displayName: `Trader_${trimmedAddress.slice(0, 6)}`,
          accountEquity: parseFloat(accountInfo.account_equity) || 0,
          positionsCount: accountInfo.positions_count,
          feeLevel: accountInfo.fee_level,
          lastSyncedAt: new Date(),
          firstSeenAt: new Date(),
        },
      });

      // Also sync their positions
      try {
        const positions = await pacifica.getPositions(trimmedAddress);
        
        if (positions.length > 0) {
          const positionPromises = positions.map((pos) =>
            prisma.strategy.create({
              data: {
                traderId: trader.id,
                symbol: pos.symbol,
                side: pos.side === "bid" ? "LONG" : "SHORT",
                size: parseFloat(pos.amount) || 0,
                entryPrice: parseFloat(pos.entry_price) || 0,
                funding: parseFloat(pos.funding) || 0,
                isolated: pos.isolated,
                openedAt: new Date(pos.created_at),
                rawData: JSON.stringify(pos),
              },
            })
          );
          await Promise.all(positionPromises);
        }
      } catch (err) {
        console.error("Failed to sync positions:", err);
      }

      return NextResponse.json({
        success: true,
        message: "Trader added successfully",
        trader,
      });
    } catch (pacificoError) {
      console.error("Pacifica API error:", pacificoError);
      return NextResponse.json(
        { error: "Failed to fetch trader data from Pacifica" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error tracking trader:", error);
    return NextResponse.json(
      {
        error: "Failed to track trader",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
