/**
 * Copy Positions Sync Engine
 * 
 * Periodically syncs copy positions with trader's actual positions.
 * Updates current prices and recalculates PnL.
 * Closes positions when trader closes them.
 * 
 * PnL Formula:
 * - LONG: size * (currentPrice - entryPrice)
 * - SHORT: size * (entryPrice - currentPrice)
 * 
 * Features:
 * - Efficient batched updates
 * - Position closing detection
 * - Comprehensive logging
 */

import { prisma } from "@/lib/prisma";
import { pacifica } from "@/lib/pacifica-client";
import { getCurrentPrices } from "@/lib/price-service";
import { executeCloseOrder } from "@/server/trade-execution/execution-service";

// ============================================================================
// Configuration
// ============================================================================

const SYNC_CONFIG = {
  // Batch size for database updates
  batchSize: 100,
  
  // Price fetch timeout (ms)
  priceTimeout: 5000,
};

// ============================================================================
// Types
// ============================================================================

interface SyncResult {
  success: boolean;
  positionsUpdated: number;
  positionsClosed: number;
  errors: SyncError[];
  duration: number;
}

interface SyncError {
  positionId: string;
  error: string;
  timestamp: number;
}

interface PriceData {
  symbol: string;
  price: number;
  timestamp: number;
}

// ============================================================================
// Logger
// ============================================================================

const logger = {
  info: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [CopySync] [INFO] ${message}`, data ? JSON.stringify(data) : "");
  },
  warn: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [CopySync] [WARN] ${message}`, data ? JSON.stringify(data) : "");
  },
  error: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [CopySync] [ERROR] ${message}`, data ? JSON.stringify(data) : "");
  },
  success: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [CopySync] [SUCCESS] ${message}`, data ? JSON.stringify(data) : "");
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

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
  if (side.toUpperCase() === "LONG") {
    return size * (currentPrice - entryPrice);
  } else {
    return size * (entryPrice - currentPrice);
  }
}

/**
 * Calculate PnL percentage
 */
function calculatePnlPercent(pnl: number, allocationUsd: number): number {
  if (allocationUsd <= 0) return 0;
  return (pnl / allocationUsd) * 100;
}

/**
 * Fetch current prices for symbols using CoinGecko price service
 */
async function fetchPricesForSymbols(_symbols: string[]): Promise<Map<string, number>> {
  try {
    return await getCurrentPrices();
  } catch (error) {
    logger.warn("Failed to fetch market prices from CoinGecko", { error });
    return new Map();
  }
}

// ============================================================================
// Core Sync Functions
// ============================================================================

/**
 * Sync all open copy positions
 * 
 * This function:
 * 1. Fetches all open copy positions
 * 2. Gets current prices for each symbol
 * 3. Updates PnL for each position
 * 4. Closes positions when trader's position is closed
 * 5. Updates in batches
 */
export async function syncCopyPositions(): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: SyncError[] = [];
  let positionsUpdated = 0;
  let positionsClosed = 0;

  logger.info("Starting copy positions sync...");

  try {
    // 1. Fetch all open copy positions with trader and strategy info
    const openPositions = await prisma.copyPosition.findMany({
      where: { status: "OPEN" },
      include: {
        trader: {
          include: {
            strategies: {
              where: { closedAt: null },
            },
          },
        },
        strategy: true,
      },
    });

    logger.info(`Found ${openPositions.length} open copy positions to sync`);

    if (openPositions.length === 0) {
      return {
        success: true,
        positionsUpdated: 0,
        positionsClosed: 0,
        errors: [],
        duration: Date.now() - startTime,
      };
    }

    // 2. Group positions by symbol for efficient price fetching
    const positionsBySymbol = new Map<string, typeof openPositions>();
    for (const position of openPositions) {
      const existing = positionsBySymbol.get(position.symbol) || [];
      existing.push(position);
      positionsBySymbol.set(position.symbol, existing);
    }

    // 3. Fetch current prices for all symbols from CoinGecko
    const symbols = Array.from(positionsBySymbol.keys());
    const priceMap = await fetchPricesForSymbols(symbols);

    // Fill in fallback prices for symbols not found in price feed
    positionsBySymbol.forEach((positions, symbol) => {
      if (!priceMap.has(symbol)) {
        priceMap.set(symbol, positions[0].entryPrice);
      }
    });

    // 4. Process positions in batches
    const updates: Promise<unknown>[] = [];
    const now = new Date();

    for (const position of openPositions) {
      try {
        // Check if trader's position is still open
        const traderPositionOpen = position.trader.strategies.some(
          (s) => s.id === position.strategyId || 
                 (s.symbol === position.symbol && s.side.toLowerCase() === position.side.toLowerCase())
        );

        if (!traderPositionOpen) {
          // For LIVE positions, execute a real close order on Pacifica first
          if (position.executionMode === "LIVE") {
            try {
              const closeResult = await executeCloseOrder({
                copyPositionId: position.id,
                userId: position.userId,
                symbol: position.symbol,
                side: position.side,
                size: position.size,
                slippagePercent: process.env.AUTO_CLOSE_SLIPPAGE_PERCENT || "3",
              });

              if (!closeResult.success) {
                logger.warn(
                  `Pacifica close failed for LIVE position ${position.id}: ${closeResult.error}. Will retry next sync.`
                );
                errors.push({
                  positionId: position.id,
                  error: `Pacifica close failed: ${closeResult.error}`,
                  timestamp: Date.now(),
                });
                continue; // Skip DB close, retry next sync cycle
              }
            } catch (err) {
              errors.push({
                positionId: position.id,
                error: `Pacifica close exception: ${err instanceof Error ? err.message : "Unknown"}`,
                timestamp: Date.now(),
              });
              continue;
            }
          }

          // Trader closed the position, close our copy too (DB)
          updates.push(
            closeCopyPosition(position.id, position.pnl).then(() => {
              positionsClosed++;
            }).catch((err) => {
              errors.push({
                positionId: position.id,
                error: err instanceof Error ? err.message : "Failed to close",
                timestamp: Date.now(),
              });
            })
          );
          continue;
        }

        // Update position with current price and PnL
        const currentPrice = priceMap.get(position.symbol) || position.entryPrice;
        const pnl = calculatePnl(position.side, position.size, position.entryPrice, currentPrice);
        const pnlPercent = calculatePnlPercent(pnl, position.allocationUsd);

        updates.push(
          prisma.copyPosition.update({
            where: { id: position.id },
            data: {
              currentPrice,
              pnl,
              pnlPercent,
              updatedAt: now,
            },
          }).then(() => {
            positionsUpdated++;
          }).catch((err) => {
            errors.push({
              positionId: position.id,
              error: err instanceof Error ? err.message : "Failed to update",
              timestamp: Date.now(),
            });
          })
        );
      } catch (error) {
        errors.push({
          positionId: position.id,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
      }
    }

    // 5. Execute updates in batches
    for (let i = 0; i < updates.length; i += SYNC_CONFIG.batchSize) {
      const batch = updates.slice(i, i + SYNC_CONFIG.batchSize);
      await Promise.all(batch);
    }

    // 6. Update user portfolio totals
    await updateUserPortfolioTotals();

    const duration = Date.now() - startTime;

    const result: SyncResult = {
      success: errors.length === 0,
      positionsUpdated,
      positionsClosed,
      errors,
      duration,
    };

    logger.success("Copy positions sync completed", {
      positionsUpdated,
      positionsClosed,
      errorsCount: errors.length,
      duration: `${duration}ms`,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Sync failed: ${errorMessage}`);
    
    return {
      success: false,
      positionsUpdated: 0,
      positionsClosed: 0,
      errors: [{
        positionId: "N/A",
        error: errorMessage,
        timestamp: Date.now(),
      }],
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Close a copy position
 */
async function closeCopyPosition(positionId: string, realizedPnl: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Get position details
    const position = await tx.copyPosition.findUnique({
      where: { id: positionId },
    });

    if (!position) return;

    // Close the position
    await tx.copyPosition.update({
      where: { id: positionId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        realizedPnl,
      },
    });

    // Update user totals
    await tx.user.update({
      where: { id: position.userId },
      data: {
        totalAllocated: { decrement: position.allocationUsd },
        totalPnl: { increment: realizedPnl },
      },
    });

    // Decrement trader copier count if no more open positions
    const remainingCount = await tx.copyPosition.count({
      where: {
        userId: position.userId,
        traderId: position.traderId,
        status: "OPEN",
      },
    });

    if (remainingCount === 0) {
      await tx.trader.update({
        where: { id: position.traderId },
        data: {
          totalCopiers: { decrement: 1 },
        },
      });
    }
  });
}

/**
 * Update all users' portfolio totals
 */
async function updateUserPortfolioTotals(): Promise<void> {
  const users = await prisma.user.findMany({
    include: {
      copyPositions: {
        where: { status: "OPEN" },
      },
    },
  });

  const updates: Promise<unknown>[] = [];

  for (const user of users) {
    const totalAllocated = user.copyPositions.reduce((sum, p) => sum + p.allocationUsd, 0);
    const totalPnl = user.copyPositions.reduce((sum, p) => sum + p.pnl, 0);

    updates.push(
      prisma.user.update({
        where: { id: user.id },
        data: {
          totalAllocated,
          totalPnl: { set: totalPnl }, // Set instead of increment to avoid double counting
        },
      })
    );
  }

  await Promise.all(updates);
}

/**
 * Sync a single user's copy positions
 */
export async function syncUserCopyPositions(userId: string): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: SyncError[] = [];
  let positionsUpdated = 0;
  let positionsClosed = 0;

  logger.info(`Starting sync for user ${userId}`);

  const openPositions = await prisma.copyPosition.findMany({
    where: {
      userId,
      status: "OPEN",
    },
    include: {
      trader: {
        include: {
          strategies: {
            where: { closedAt: null },
          },
        },
      },
    },
  });

  const prices = await getCurrentPrices();

  for (const position of openPositions) {
    try {
      const currentPrice = prices.get(position.symbol) ?? position.entryPrice;
      const pnl = calculatePnl(position.side, position.size, position.entryPrice, currentPrice);
      const pnlPercent = calculatePnlPercent(pnl, position.allocationUsd);

      await prisma.copyPosition.update({
        where: { id: position.id },
        data: {
          currentPrice,
          pnl,
          pnlPercent,
        },
      });

      positionsUpdated++;
    } catch (error) {
      errors.push({
        positionId: position.id,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      });
    }
  }

  return {
    success: errors.length === 0,
    positionsUpdated,
    positionsClosed: positionsClosed,
    errors,
    duration: Date.now() - startTime,
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

// Allow running as: npx tsx src/server/copy/sync-copy-positions.ts
if (typeof window === "undefined" && process.argv[1]?.includes("sync-copy-positions")) {
  (async () => {
    console.log("\n🔄 Starting Copy Positions Sync\n");
    const result = await syncCopyPositions();
    
    console.log("\n📊 Sync Results:");
    console.log(`   Positions updated: ${result.positionsUpdated}`);
    console.log(`   Positions closed: ${result.positionsClosed}`);
    console.log(`   Errors: ${result.errors.length}`);
    console.log(`   Duration: ${result.duration}ms\n`);
    
    if (result.errors.length > 0) {
      console.log("❌ Errors:");
      result.errors.forEach((e) => {
        console.log(`   - ${e.positionId}: ${e.error}`);
      });
      process.exit(1);
    }
    
    console.log("✅ Sync completed successfully!\n");
    process.exit(0);
  })();
}
