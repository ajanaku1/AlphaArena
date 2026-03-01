import { NextRequest, NextResponse } from "next/server";
import {
  getLeaderboardData,
  type ParsedLeaderboardEntry,
} from "@/lib/leaderboard-cache";
import { prisma } from "@/lib/prisma";

const VALID_SORT_COLUMNS = [
  "pnl_all_time",
  "pnl_7d",
  "pnl_30d",
  "pnl_1d",
  "equity_current",
  "volume_all_time",
  "oi_current",
] as const;

type SortColumn = (typeof VALID_SORT_COLUMNS)[number];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20"))
    );
    const sortBy = (searchParams.get("sortBy") || "pnl_all_time") as SortColumn;
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const profitableOnly = searchParams.get("profitableOnly") === "true";

    // Validate sort column
    if (!VALID_SORT_COLUMNS.includes(sortBy)) {
      return NextResponse.json(
        { error: `Invalid sortBy. Must be one of: ${VALID_SORT_COLUMNS.join(", ")}` },
        { status: 400 }
      );
    }

    const cacheState = await getLeaderboardData();
    let filtered = cacheState.data;

    // Apply search filter
    if (search) {
      filtered = filtered.filter(
        (entry) =>
          entry.address.toLowerCase().includes(search) ||
          (entry.username && entry.username.toLowerCase().includes(search))
      );
    }

    // Apply profitable-only filter
    if (profitableOnly) {
      filtered = filtered.filter((entry) => entry.pnl_all_time > 0);
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = a[sortBy] as number;
      const bVal = b[sortBy] as number;
      return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
    });

    // Paginate
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (page - 1) * pageSize;
    const pageData = filtered.slice(startIndex, startIndex + pageSize);

    // Enrich with copier counts from local Trader table (graceful degradation)
    let copierMap = new Map<string, number>();
    try {
      const addresses = pageData.map((e) => e.address);
      const traders = await prisma.trader.findMany({
        where: { pacificaTraderId: { in: addresses } },
        select: { pacificaTraderId: true, totalCopiers: true },
      });
      copierMap = new Map(
        traders.map((t) => [t.pacificaTraderId, t.totalCopiers])
      );
    } catch {
      // DB unavailable (e.g. SQLite on Vercel) — continue without enrichment
    }

    const enrichedData = pageData.map((entry) => ({
      ...entry,
      copierCount: copierMap.get(entry.address) ?? 0,
    }));

    return NextResponse.json({
      data: enrichedData,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
      meta: {
        cachedAt: cacheState.cachedAt,
        totalTraders: cacheState.totalTraders,
      },
    });
  } catch (error) {
    console.error("[Arena Leaderboard API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard data" },
      { status: 500 }
    );
  }
}
