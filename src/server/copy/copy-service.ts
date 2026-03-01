/**
 * Copy Trading Service
 *
 * Handles one-click copy trading with proportional position sizing.
 * Supports both SIMULATION and LIVE (real Pacifica orders) modes.
 *
 * Features:
 * - Proportional position sizing based on trader's equity
 * - Idempotency protection
 * - Transaction safety
 * - Live trade execution via Pacifica agent wallet
 * - Detailed logging
 */

import { prisma } from "@/lib/prisma";
import type { Trader, Strategy, CopyPosition } from "@prisma/client";
import { executeBatchOpen, executeCloseOrder } from "@/server/trade-execution/execution-service";
import { checkCopyBadges } from "@/server/badges/badge-service";

// ============================================================================
// Types
// ============================================================================

export interface CopyTraderParams {
  userId: string;
  traderId: string;
  allocationUsd: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
  idempotencyKey?: string; // For preventing duplicate copies
}

export interface CopyResult {
  success: boolean;
  copyPositions: CopyPositionSummary[];
  totalAllocated: number;
  message: string;
  error?: string;
}

export interface CopyPositionSummary {
  id: string;
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  allocationUsd: number;
  status: string;
}

export interface CopiedTraderSummary {
  traderId: string;
  displayName: string | null;
  pacificaTraderId: string;
  positionCount: number;
  totalAllocated: number;
  totalPnl: number;
  totalPnlPercent: number;
  executionMode: string;
  positions: CopyPositionWithDetails[];
}

export interface PortfolioSummary {
  totalValue: number;
  totalAllocated: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: CopyPositionWithDetails[];
  closedPositions: CopyPositionWithDetails[];
  copiedTraders: CopiedTraderSummary[];
  tradersCount: number;
}

export interface CopyPositionWithDetails extends CopyPosition {
  trader: {
    id: string;
    displayName: string | null;
    pacificaTraderId: string;
  };
}

// ============================================================================
// Logger
// ============================================================================

const logger = {
  info: (message: string, data?: unknown) => {
    console.log(`[CopyService] [INFO] ${message}`, data ? JSON.stringify(data) : "");
  },
  warn: (message: string, data?: unknown) => {
    console.warn(`[CopyService] [WARN] ${message}`, data ? JSON.stringify(data) : "");
  },
  error: (message: string, data?: unknown) => {
    console.error(`[CopyService] [ERROR] ${message}`, data ? JSON.stringify(data) : "");
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate proportional position size
 * 
 * Formula: userPositionSize = (allocationUsd / traderEquity) * traderPositionSize
 */
function calculateProportionalSize(
  traderEquity: number,
  traderPositionSize: number,
  allocationUsd: number
): number {
  if (traderEquity <= 0) {
    // If trader equity is unknown, use direct allocation
    return allocationUsd;
  }
  
  const ratio = allocationUsd / traderEquity;
  return traderPositionSize * ratio;
}

/**
 * Calculate PnL for a position
 * 
 * LONG: size * (currentPrice - entryPrice)
 * SHORT: size * (entryPrice - currentPrice)
 */
function calculatePnl(
  side: string,
  size: number,
  entryPrice: number,
  currentPrice: number
): number {
  if (side.toUpperCase() === "LONG" || side === "bid") {
    return size * (currentPrice - entryPrice);
  } else {
    return size * (entryPrice - currentPrice);
  }
}

/**
 * Normalize side from Pacifica format to our format
 * Pacifica: "bid" = long, "ask" = short
 */
function normalizeSide(side: string): string {
  if (side === "bid") return "LONG";
  if (side === "ask") return "SHORT";
  return side.toUpperCase();
}

// ============================================================================
// Core Copy Functions
// ============================================================================

/**
 * Copy a trader's positions for a user
 * 
 * This function:
 * 1. Fetches trader's open strategies
 * 2. Calculates proportional sizing for each position
 * 3. Creates CopyPosition records
 * 4. Updates user's total allocated
 */
export async function copyTraderForUser(params: CopyTraderParams): Promise<CopyResult> {
  const {
    userId,
    traderId,
    allocationUsd,
    stopLoss,
    takeProfit,
    leverage = 1,
  } = params;

  logger.info(`Starting copy for user ${userId}, trader ${traderId}, allocation $${allocationUsd}`);

  // Validate allocation
  if (allocationUsd <= 0) {
    return {
      success: false,
      copyPositions: [],
      totalAllocated: 0,
      message: "Allocation must be greater than 0",
      error: "INVALID_ALLOCATION",
    };
  }

  if (allocationUsd < 10) {
    return {
      success: false,
      copyPositions: [],
      totalAllocated: 0,
      message: "Minimum allocation is $10",
      error: "MINIMUM_ALLOCATION",
    };
  }

  if (allocationUsd > 1000000) {
    return {
      success: false,
      copyPositions: [],
      totalAllocated: 0,
      message: "Maximum allocation is $1,000,000",
      error: "MAXIMUM_ALLOCATION",
    };
  }

  try {
    // Use a transaction for safety
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch trader with open strategies
      const trader = await tx.trader.findUnique({
        where: { id: traderId },
        include: {
          strategies: {
            where: { closedAt: null }, // Only open positions
          },
        },
      });

      if (!trader) {
        throw new Error("Trader not found");
      }

      if (trader.strategies.length === 0) {
        throw new Error("Trader has no open positions to copy");
      }

      // 2. Check if user already has an active copy for this trader
      const existingCopy = await tx.copyPosition.findFirst({
        where: {
          userId,
          traderId,
          status: "OPEN",
        },
      });

      if (existingCopy) {
        throw new Error("You already have an active copy for this trader. Close it first or create a new position.");
      }

      // Clean up any orphaned EXECUTION_FAILED positions from previous attempts
      const failedPositions = await tx.copyPosition.findMany({
        where: {
          userId,
          traderId,
          status: "EXECUTION_FAILED",
        },
      });

      if (failedPositions.length > 0) {
        logger.info(`Cleaning up ${failedPositions.length} failed positions from previous attempt`);
        await tx.copyPosition.deleteMany({
          where: {
            userId,
            traderId,
            status: "EXECUTION_FAILED",
          },
        });
      }

      // 3. Calculate trader's total equity used for sizing
      const traderEquity = trader.accountEquity || allocationUsd; // Fallback to allocation if equity is 0

      // 4. Create copy positions for each of trader's open strategies
      const copyPositions: CopyPositionSummary[] = [];
      let totalAllocated = 0;

      // Calculate allocation per position (proportional to trader's position size)
      const totalTraderSize = trader.strategies.reduce((sum, s) => sum + (s.size * s.entryPrice), 0);

      for (const strategy of trader.strategies) {
        // Calculate position's share of trader's portfolio
        const positionValue = strategy.size * strategy.entryPrice;
        const positionRatio = totalTraderSize > 0 ? positionValue / totalTraderSize : 1 / trader.strategies.length;
        
        // Allocate proportionally
        const positionAllocation = allocationUsd * positionRatio;
        
        // Calculate proportional size
        const proportionalSize = calculateProportionalSize(
          traderEquity,
          strategy.size,
          positionAllocation
        );

        // Create copy position
        const copyPosition = await tx.copyPosition.create({
          data: {
            userId,
            traderId,
            strategyId: strategy.id,
            symbol: strategy.symbol,
            side: normalizeSide(strategy.side),
            size: proportionalSize,
            entryPrice: strategy.entryPrice,
            currentPrice: strategy.entryPrice, // Start at entry
            pnl: 0,
            pnlPercent: 0,
            allocationUsd: positionAllocation,
            allocationType: "FIXED",
            status: "OPEN",
            stopLoss,
            takeProfit,
            leverage,
            openedAt: new Date(),
          },
        });

        copyPositions.push({
          id: copyPosition.id,
          symbol: copyPosition.symbol,
          side: copyPosition.side,
          size: copyPosition.size,
          entryPrice: copyPosition.entryPrice,
          allocationUsd: copyPosition.allocationUsd,
          status: copyPosition.status,
        });

        totalAllocated += positionAllocation;
      }

      // 5. Update user's total allocated
      await tx.user.update({
        where: { id: userId },
        data: {
          totalAllocated: { increment: totalAllocated },
        },
      });

      // 6. Increment trader's copier count
      await tx.trader.update({
        where: { id: traderId },
        data: {
          totalCopiers: { increment: 1 },
        },
      });

      return { copyPositions, totalAllocated };
    });

    logger.info(`Copy completed successfully. Created ${result.copyPositions.length} positions.`);

    // Attempt to execute real orders on Pacifica (non-blocking best-effort)
    if (result.copyPositions.length > 0) {
      executeBatchOpen({
        userId,
        orders: result.copyPositions.map((cp) => ({
          copyPositionId: cp.id,
          symbol: cp.symbol,
          side: cp.side,
          size: cp.size,
        })),
      })
        .then((executionResult) => {
          if (executionResult.totalFailed > 0) {
            logger.warn(
              `${executionResult.totalFailed} of ${result.copyPositions.length} Pacifica orders failed (positions remain open)`
            );
          } else {
            logger.info(`All ${result.copyPositions.length} Pacifica orders executed successfully`);
          }
        })
        .catch((execError) => {
          logger.warn(`Pacifica execution failed (positions remain open): ${execError}`);
        });
    }

    // Check copy-trading badges (non-blocking)
    checkCopyBadges(userId).catch((err) =>
      logger.warn(`Badge check failed: ${err}`)
    );

    return {
      success: true,
      copyPositions: result.copyPositions,
      totalAllocated: result.totalAllocated,
      message: `Successfully copied trader with ${result.copyPositions.length} position(s)`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Copy failed: ${errorMessage}`);

    return {
      success: false,
      copyPositions: [],
      totalAllocated: 0,
      message: errorMessage,
      error: "COPY_FAILED",
    };
  }
}

/**
 * Close a copy position
 */
export async function closeCopyPosition(
  userId: string,
  positionId: string
): Promise<{ success: boolean; realizedPnl: number; message: string }> {
  logger.info(`Closing copy position ${positionId} for user ${userId}`);

  try {
    // Pre-check: if this is a LIVE position, execute close order on Pacifica first
    const preCheck = await prisma.copyPosition.findFirst({
      where: { id: positionId, userId, status: "OPEN" },
    });

    if (!preCheck) {
      return { success: false, realizedPnl: 0, message: "Position not found or already closed" };
    }

    // Attempt Pacifica close (best-effort, non-blocking for DB close)
    if (preCheck.executionMode === "LIVE") {
      logger.info(`Executing live close order for position ${positionId} on Pacifica`);
      executeCloseOrder({
        copyPositionId: positionId,
        userId,
        symbol: preCheck.symbol,
        side: preCheck.side,
        size: preCheck.size,
      })
        .then((closeResult) => {
          if (!closeResult.success) {
            logger.warn(`Pacifica close failed (position closed locally): ${closeResult.error}`);
          }
        })
        .catch((err) => {
          logger.warn(`Pacifica close error (position closed locally): ${err}`);
        });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Find the position
      const position = await tx.copyPosition.findFirst({
        where: {
          id: positionId,
          userId,
          status: "OPEN",
        },
      });

      if (!position) {
        throw new Error("Position not found or already closed");
      }

      // Calculate final PnL
      const realizedPnl = position.pnl;

      // Close the position
      await tx.copyPosition.update({
        where: { id: positionId },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          realizedPnl,
        },
      });

      // Update user's total allocated and PnL
      await tx.user.update({
        where: { id: userId },
        data: {
          totalAllocated: { decrement: position.allocationUsd },
          totalPnl: { increment: realizedPnl },
        },
      });

      // Decrement trader's copier count if this was the last position
      const remainingPositions = await tx.copyPosition.count({
        where: {
          userId,
          traderId: position.traderId,
          status: "OPEN",
        },
      });

      if (remainingPositions === 0) {
        await tx.trader.update({
          where: { id: position.traderId },
          data: {
            totalCopiers: { decrement: 1 },
          },
        });
      }

      return { realizedPnl };
    });

    logger.info(`Position closed. Realized PnL: $${result.realizedPnl.toFixed(2)}`);

    return {
      success: true,
      realizedPnl: result.realizedPnl,
      message: `Position closed. PnL: $${result.realizedPnl.toFixed(2)}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to close position: ${errorMessage}`);

    return {
      success: false,
      realizedPnl: 0,
      message: errorMessage,
    };
  }
}

/**
 * Get user's portfolio summary
 */
export async function getUserPortfolio(userId: string): Promise<PortfolioSummary> {
  logger.info(`Fetching portfolio for user ${userId}`);

  // Fetch all copy positions with trader info
  const positions = await prisma.copyPosition.findMany({
    where: { userId },
    include: {
      trader: {
        select: {
          id: true,
          displayName: true,
          pacificaTraderId: true,
        },
      },
    },
    orderBy: { openedAt: "desc" },
  });

  const openPositions = positions.filter((p) => p.status === "OPEN");
  const closedPositions = positions.filter((p) => p.status === "CLOSED");

  // Calculate totals
  const totalAllocated = openPositions.reduce((sum, p) => sum + p.allocationUsd, 0);
  const totalPnl = positions.reduce((sum, p) => sum + (p.status === "CLOSED" ? p.realizedPnl : p.pnl), 0);
  const totalValue = totalAllocated + openPositions.reduce((sum, p) => sum + p.pnl, 0) + closedPositions.reduce((sum, p) => sum + p.realizedPnl, 0);

  // Group open positions by trader
  const traderMap = new Map<string, CopiedTraderSummary>();
  for (const position of openPositions) {
    const p = position as CopyPositionWithDetails;
    const existing = traderMap.get(p.traderId);
    if (existing) {
      existing.positionCount++;
      existing.totalAllocated += p.allocationUsd;
      existing.totalPnl += p.pnl;
      existing.positions.push(p);
      if (p.executionMode === "LIVE") existing.executionMode = "LIVE";
    } else {
      traderMap.set(p.traderId, {
        traderId: p.traderId,
        displayName: p.trader.displayName,
        pacificaTraderId: p.trader.pacificaTraderId,
        positionCount: 1,
        totalAllocated: p.allocationUsd,
        totalPnl: p.pnl,
        totalPnlPercent: 0,
        executionMode: p.executionMode || "SIMULATION",
        positions: [p],
      });
    }
  }

  // Calculate PnL percentages per trader
  const copiedTraders = Array.from(traderMap.values()).map((t) => ({
    ...t,
    totalPnlPercent: t.totalAllocated > 0 ? (t.totalPnl / t.totalAllocated) * 100 : 0,
  }));

  const uniqueTraders = copiedTraders.length;

  return {
    totalValue,
    totalAllocated,
    totalPnl,
    totalPnlPercent: totalAllocated > 0 ? (totalPnl / totalAllocated) * 100 : 0,
    openPositions: openPositions as CopyPositionWithDetails[],
    closedPositions: closedPositions as CopyPositionWithDetails[],
    copiedTraders,
    tradersCount: uniqueTraders,
  };
}

/**
 * Get user's open copy positions for a specific trader
 */
export async function getUserCopyPositionsForTrader(
  userId: string,
  traderId: string
): Promise<CopyPositionWithDetails[]> {
  const positions = await prisma.copyPosition.findMany({
    where: {
      userId,
      traderId,
      status: "OPEN",
    },
    include: {
      trader: {
        select: {
          id: true,
          displayName: true,
          pacificaTraderId: true,
        },
      },
    },
  });

  return positions as CopyPositionWithDetails[];
}

/**
 * Stop copying a trader entirely — close all open positions for that trader.
 * Uses a single batch transaction for speed.
 */
export async function stopCopyingTrader(
  userId: string,
  traderId: string
): Promise<{ success: boolean; closedCount: number; totalRealizedPnl: number; errors: string[] }> {
  logger.info(`Stopping copy for user ${userId}, trader ${traderId}`);

  const openPositions = await prisma.copyPosition.findMany({
    where: { userId, traderId, status: "OPEN" },
  });

  if (openPositions.length === 0) {
    return { success: true, closedCount: 0, totalRealizedPnl: 0, errors: [] };
  }

  const totalRealizedPnl = openPositions.reduce((sum, p) => sum + p.pnl, 0);
  const totalAllocated = openPositions.reduce((sum, p) => sum + p.allocationUsd, 0);
  const positionIds = openPositions.map((p) => p.id);

  // Batch close all positions in a single transaction
  await prisma.$transaction([
    prisma.copyPosition.updateMany({
      where: { id: { in: positionIds } },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        realizedPnl: 0, // Will be set individually below if needed
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        totalAllocated: { decrement: totalAllocated },
        totalPnl: { increment: totalRealizedPnl },
      },
    }),
    prisma.trader.update({
      where: { id: traderId },
      data: {
        totalCopiers: { decrement: 1 },
      },
    }),
  ]);

  // Set individual realized PnL values
  for (const position of openPositions) {
    await prisma.copyPosition.update({
      where: { id: position.id },
      data: { realizedPnl: position.pnl },
    });
  }

  // Fire off Pacifica closes best-effort (non-blocking)
  for (const position of openPositions) {
    if (position.executionMode === "LIVE") {
      executeCloseOrder({
        copyPositionId: position.id,
        userId,
        symbol: position.symbol,
        side: position.side,
        size: position.size,
      }).catch((err) => {
        logger.warn(`Pacifica close failed for ${position.symbol} (closed locally): ${err}`);
      });
    }
  }

  logger.info(
    `Stopped copying trader ${traderId}: ${openPositions.length} closed, PnL: $${totalRealizedPnl.toFixed(2)}`
  );

  return {
    success: true,
    closedCount: openPositions.length,
    totalRealizedPnl,
    errors: [],
  };
}

/**
 * Check if user is already copying a trader
 */
export async function isUserCopyingTrader(
  userId: string,
  traderId: string
): Promise<boolean> {
  const count = await prisma.copyPosition.count({
    where: {
      userId,
      traderId,
      status: "OPEN",
    },
  });

  return count > 0;
}
