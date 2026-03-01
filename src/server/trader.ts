import { prisma } from "@/lib/prisma";

/**
 * Server-side utilities for trader operations
 */

export interface GetTradersOptions {
  limit?: number;
  offset?: number;
  sortBy?: "totalPnl" | "winRate" | "accountEquity" | "totalCopiers";
  sortOrder?: "asc" | "desc";
  search?: string;
}

/**
 * Get traders with pagination, sorting, and search
 */
export async function getTraders(options: GetTradersOptions = {}) {
  const {
    limit = 20,
    offset = 0,
    sortBy = "totalPnl",
    sortOrder = "desc",
    search,
  } = options;

  // SQLite doesn't support mode: "insensitive", so we search with lowercase contains
  const searchLower = search?.toLowerCase();
  const where = searchLower
    ? {
        OR: [
          { displayName: { contains: searchLower } },
          { pacificaTraderId: { contains: searchLower } },
        ],
      }
    : {};

  const [traders, total] = await Promise.all([
    prisma.trader.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: offset,
      take: limit,
      include: {
        strategies: {
          where: { closedAt: null }, // Only open positions
          orderBy: { pnl: "desc" },
          take: 5,
        },
      },
    }),
    prisma.trader.count({ where }),
  ]);

  return {
    traders,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Get a single trader by ID with full details
 */
export async function getTraderById(id: string) {
  return prisma.trader.findUnique({
    where: { id },
    include: {
      strategies: {
        where: { closedAt: null },
        orderBy: { openedAt: "desc" },
      },
      copyPositions: {
        where: { status: "OPEN" },
      },
    },
  });
}

/**
 * Get a trader by Pacifica wallet address
 */
export async function getTraderByPacificaId(pacificaTraderId: string) {
  return prisma.trader.findUnique({
    where: { pacificaTraderId },
    include: {
      strategies: {
        where: { closedAt: null },
        orderBy: { pnl: "desc" },
      },
    },
  });
}

/**
 * Get trader's open positions (strategies)
 */
export async function getTraderPositions(traderId: string) {
  return prisma.strategy.findMany({
    where: {
      traderId,
      closedAt: null,
    },
    orderBy: { pnl: "desc" },
  });
}

/**
 * Get trader's closed positions with PnL
 */
export async function getTraderClosedPositions(
  traderId: string,
  limit: number = 50
) {
  return prisma.strategy.findMany({
    where: {
      traderId,
      closedAt: { not: null },
    },
    orderBy: { closedAt: "desc" },
    take: limit,
  });
}

/**
 * Get top traders by PnL
 */
export async function getTopTraders(limit: number = 10) {
  return prisma.trader.findMany({
    orderBy: { totalPnl: "desc" },
    take: limit,
    include: {
      strategies: {
        where: { closedAt: null },
        orderBy: { pnl: "desc" },
        take: 3,
      },
    },
  });
}

/**
 * Get top traders by win rate (minimum 10 trades)
 */
export async function getTopTradersByWinRate(limit: number = 10) {
  return prisma.trader.findMany({
    where: {
      // Could add minimum trades filter if we track it
    },
    orderBy: { winRate: "desc" },
    take: limit,
    include: {
      strategies: {
        where: { closedAt: null },
        orderBy: { pnl: "desc" },
        take: 3,
      },
    },
  });
}

/**
 * Create or update a copy position
 */
export async function createCopyPosition(data: {
  userId: string;
  traderId: string;
  strategyId?: string;
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  allocationUsd: number;
  allocationType?: "FIXED" | "PERCENTAGE";
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
}) {
  const { userId, traderId, strategyId, symbol, side, size, entryPrice, allocationUsd, allocationType, stopLoss, takeProfit, leverage } = data;
  
  return prisma.copyPosition.create({
    data: {
      userId,
      traderId,
      strategyId,
      symbol,
      side,
      size,
      entryPrice,
      allocationUsd,
      allocationType: allocationType || "FIXED",
      stopLoss,
      takeProfit,
      leverage: leverage || 1,
      status: "OPEN",
    },
  });
}

/**
 * Get user's copy positions
 */
export async function getUserCopyPositions(userId: string) {
  return prisma.copyPosition.findMany({
    where: { userId },
    include: {
      trader: {
        select: {
          id: true,
          displayName: true,
          pacificaTraderId: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Update trader's copier count
 */
export async function incrementTraderCopiers(traderId: string) {
  return prisma.trader.update({
    where: { id: traderId },
    data: {
      totalCopiers: { increment: 1 },
    },
  });
}

/**
 * Decrement trader's copier count
 */
export async function decrementTraderCopiers(traderId: string) {
  return prisma.trader.update({
    where: { id: traderId },
    data: {
      totalCopiers: { decrement: 1 },
    },
  });
}

/**
 * Get active competitions
 */
export async function getActiveCompetitions() {
  return prisma.competition.findMany({
    where: { status: "ACTIVE" },
    orderBy: { endAt: "asc" },
  });
}

/**
 * Get leaderboard for a competition
 */
export async function getLeaderboard(competitionId: string, limit: number = 50) {
  return prisma.leaderboardEntry.findMany({
    where: { competitionId },
    orderBy: { rank: "asc" },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });
}
