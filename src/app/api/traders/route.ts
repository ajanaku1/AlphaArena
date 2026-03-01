import { NextRequest, NextResponse } from "next/server";
import { getTraders } from "@/server/trader";

/**
 * GET /api/traders
 * 
 * Query parameters:
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 * - sortBy: "totalPnl" | "winRate" | "accountEquity" | "totalCopiers" (default: "totalPnl")
 * - sortOrder: "asc" | "desc" (default: "desc")
 * - search: string (search by displayName or wallet address)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate parameters
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || "20")),
      100
    );

    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0"));

    const sortBy = searchParams.get("sortBy") as
      | "totalPnl"
      | "winRate"
      | "accountEquity"
      | "totalCopiers"
      | null;

    const validSortBy = ["totalPnl", "winRate", "accountEquity", "totalCopiers"];
    const validatedSortBy = sortBy && validSortBy.includes(sortBy)
      ? sortBy
      : "totalPnl";

    const sortOrder = searchParams.get("sortOrder") as "asc" | "desc" | null;
    const validatedSortOrder = sortOrder === "asc" || sortOrder === "desc"
      ? sortOrder
      : "desc";

    const search = searchParams.get("search") || undefined;

    // Fetch traders
    const { traders, total, hasMore } = await getTraders({
      limit,
      offset,
      sortBy: validatedSortBy,
      sortOrder: validatedSortOrder,
      search,
    });

    // Transform for response
    const response = {
      data: traders.map((trader) => ({
        id: trader.id,
        pacificaTraderId: trader.pacificaTraderId,
        displayName: trader.displayName,
        avatarUrl: trader.avatarUrl,
        totalPnl: trader.totalPnl,
        winRate: trader.winRate,
        totalFollowers: trader.totalFollowers,
        totalCopiers: trader.totalCopiers,
        accountEquity: trader.accountEquity,
        positionsCount: trader.positionsCount,
        feeLevel: trader.feeLevel,
        lastSyncedAt: trader.lastSyncedAt.toISOString(),
        strategies: trader.strategies.map((s) => ({
          id: s.id,
          symbol: s.symbol,
          side: s.side,
          size: s.size,
          entryPrice: s.entryPrice,
          pnl: s.pnl,
          openedAt: s.openedAt.toISOString(),
        })),
      })),
      pagination: {
        limit,
        offset,
        total,
        hasMore,
      },
      filters: {
        sortBy: validatedSortBy,
        sortOrder: validatedSortOrder,
        search,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching traders:", error);
    
    return NextResponse.json(
      {
        error: "Failed to fetch traders",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
