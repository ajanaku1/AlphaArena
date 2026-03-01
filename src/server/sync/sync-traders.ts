/**
 * Trader Sync Service
 * 
 * Synchronizes trader data from Pacifica API to our database.
 * 
 * Features:
 * - Idempotent upserts
 * - Performance metrics calculation
 * - Position tracking
 * - Comprehensive logging
 */

import { prisma } from "@/lib/prisma";
import {
  pacifica,
  type PacificaPosition,
  type PacificaAccountInfo,
  type PacificaTrade,
  type PacificaLeaderboardEntry,
} from "@/lib/pacifica-client";
import { calculateRiskMetrics } from "@/lib/risk-analytics";

// ============================================================================
// Configuration
// ============================================================================

const SYNC_CONFIG = {
  // List of trader wallet addresses to track
  // In production, this would come from a config file or database
  trackedTraders: process.env.TRACKED_TRADERS?.split(",") || [
    // Example trader addresses (replace with real ones)
    // "42trU9A5...",
    // "7xK9mN2p...",
  ],
  
  // Trade history limit for performance calculation
  tradeHistoryLimit: 100,
  
  // Batch size for database operations
  batchSize: 50,
};

// ============================================================================
// Types
// ============================================================================

interface SyncResult {
  success: boolean;
  tradersSynced: number;
  strategiesSynced: number;
  errors: SyncError[];
  duration: number;
}

interface SyncError {
  traderId: string;
  error: string;
  timestamp: number;
}

interface TraderMetrics {
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
}

// ============================================================================
// Logger
// ============================================================================

const logger = {
  info: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`, data ? JSON.stringify(data) : "");
  },
  warn: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${message}`, data ? JSON.stringify(data) : "");
  },
  error: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`, data ? JSON.stringify(data) : "");
  },
  success: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SUCCESS] ${message}`, data ? JSON.stringify(data) : "");
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate trader metrics from trade history
 */
function calculateTraderMetrics(trades: PacificaTrade[]): TraderMetrics {
  if (trades.length === 0) {
    return {
      totalPnl: 0,
      winRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
    };
  }

  // Only count closing trades for PnL calculation
  const closingTrades = trades.filter(
    (t) => t.side === "close_long" || t.side === "close_short"
  );

  const pnls = closingTrades.map((t) => parseFloat(t.pnl) || 0);
  const winningTrades = pnls.filter((pnl) => pnl > 0);
  const losingTrades = pnls.filter((pnl) => pnl <= 0);

  const totalPnl = pnls.reduce((sum, pnl) => sum + pnl, 0);
  const winRate = closingTrades.length > 0
    ? (winningTrades.length / closingTrades.length) * 100
    : 0;

  return {
    totalPnl,
    winRate,
    totalTrades: closingTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
  };
}

/**
 * Normalize Pacifica position to Strategy model
 */
function normalizePosition(
  traderId: string,
  position: PacificaPosition
): {
  traderId: string;
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  pnl: number;
  margin: number | null;
  funding: number;
  isolated: boolean;
  openedAt: Date;
  rawData: string;
} {
  return {
    traderId,
    symbol: position.symbol,
    side: position.side,
    size: parseFloat(position.amount) || 0,
    entryPrice: parseFloat(position.entry_price) || 0,
    pnl: 0, // Realized PnL comes from trade history
    margin: position.margin ? parseFloat(position.margin) : null,
    funding: parseFloat(position.funding) || 0,
    isolated: position.isolated,
    openedAt: new Date(position.created_at),
    rawData: JSON.stringify(position),
  };
}

// ============================================================================
// Core Sync Functions
// ============================================================================

/**
 * Sync a single trader's data from Pacifica
 * @param traderAddress - Wallet address
 * @param leaderboardEntry - Optional leaderboard data (has all-time PnL, volume, etc.)
 */
async function syncTrader(
  traderAddress: string,
  leaderboardEntry?: PacificaLeaderboardEntry
): Promise<{
  traderId?: string;
  strategiesCount: number;
  metrics: TraderMetrics | null;
}> {
  const startTime = Date.now();
  let strategiesCount = 0;
  let metrics: TraderMetrics | null = null;

  try {
    // Fetch account info
    const accountInfo = await pacifica.getAccountInfo(traderAddress);

    if (!accountInfo) {
      throw new Error("Account not found or invalid address");
    }

    // Fetch positions
    const positions = await pacifica.getPositions(traderAddress);

    // Fetch trade history for performance metrics
    const { trades } = await pacifica.getTradeHistory(traderAddress, {
      limit: SYNC_CONFIG.tradeHistoryLimit,
    });

    // Calculate metrics from trade history
    metrics = calculateTraderMetrics(trades);

    // If we have leaderboard data, use the all-time PnL (more accurate than last 100 trades)
    if (leaderboardEntry) {
      const allTimePnl = parseFloat(leaderboardEntry.pnl_all_time) || 0;
      if (allTimePnl !== 0) {
        metrics.totalPnl = allTimePnl;
      }
    }

    // Calculate risk metrics
    const riskMetrics = calculateRiskMetrics(trades);

    // Use leaderboard username or generate display name
    const displayName = leaderboardEntry?.username
      || `Trader ${traderAddress.slice(0, 6)}...${traderAddress.slice(-4)}`;

    // Upsert trader
    const traderData = {
      displayName,
      totalPnl: metrics.totalPnl,
      winRate: metrics.winRate,
      accountEquity: parseFloat(accountInfo.account_equity) || 0,
      positionsCount: positions.length,
      feeLevel: accountInfo.fee_level,
      totalFollowers: 0,
      totalCopiers: 0,
      maxDrawdown: riskMetrics.maxDrawdown,
      sharpeRatio: riskMetrics.sharpeRatio,
      volatility: riskMetrics.volatility,
      profitFactor: riskMetrics.profitFactor,
      lastSyncedAt: new Date(),
    };

    const trader = await prisma.trader.upsert({
      where: { pacificaTraderId: traderAddress },
      update: traderData,
      create: {
        pacificaTraderId: traderAddress,
        ...traderData,
        firstSeenAt: new Date(),
      },
    });

    logger.info(`Upserted trader ${traderAddress}`, {
      traderId: trader.id,
      pnl: metrics.totalPnl,
      winRate: metrics.winRate,
      positionsCount: positions.length,
    });

    // Sync positions as strategies
    if (positions.length > 0) {
      strategiesCount = await syncTraderPositions(trader.id, positions);
    }

    const duration = Date.now() - startTime;
    logger.success(`Synced trader ${traderAddress} in ${duration}ms`, {
      traderId: trader.id,
      strategiesCount,
    });

    return {
      traderId: trader.id,
      strategiesCount,
      metrics,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to sync trader ${traderAddress}`, { error: errorMessage });

    return {
      strategiesCount: 0,
      metrics: null,
    };
  }
}

/**
 * Sync trader's positions to Strategy table
 */
async function syncTraderPositions(
  traderId: string,
  positions: PacificaPosition[]
): Promise<number> {
  const now = new Date();
  
  // Get existing strategies for this trader
  const existingStrategies = await prisma.strategy.findMany({
    where: { traderId },
    select: { symbol: true, side: true, id: true },
  });

  // Create a map of existing strategies by symbol+side
  const existingMap = new Map<string, string>();
  existingStrategies.forEach((s) => {
    existingMap.set(`${s.symbol}-${s.side}`, s.id);
  });

  const upserts: Promise<unknown>[] = [];

  for (const position of positions) {
    const key = `${position.symbol}-${position.side}`;
    const existingId = existingMap.get(key);

    const data = normalizePosition(traderId, position);

    if (existingId) {
      // Update existing position
      upserts.push(
        prisma.strategy.update({
          where: { id: existingId },
          data: {
            ...data,
            updatedAt: now,
          },
        })
      );
    } else {
      // Create new position
      upserts.push(
        prisma.strategy.create({
          data,
        })
      );
    }
  }

  // Execute upserts in batches
  const batchSize = SYNC_CONFIG.batchSize;
  for (let i = 0; i < upserts.length; i += batchSize) {
    const batch = upserts.slice(i, i + batchSize);
    await Promise.all(batch);
  }

  // Close strategies for positions that no longer exist
  const currentKeys = new Set(positions.map((p) => `${p.symbol}-${p.side}`));
  const toClose = existingStrategies.filter((s) => !currentKeys.has(`${s.symbol}-${s.side}`));

  if (toClose.length > 0) {
    await prisma.strategy.updateMany({
      where: {
        id: { in: toClose.map((s) => s.id) },
        closedAt: null,
      },
      data: {
        closedAt: now,
      },
    });
  }

  return positions.length;
}

// ============================================================================
// Main Sync Function
// ============================================================================

/**
 * Sync all tracked traders from Pacifica.
 * If TRACKED_TRADERS is empty, auto-discovers top traders from the leaderboard.
 */
export async function syncAllTraders(): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: SyncError[] = [];
  let tradersSynced = 0;
  let strategiesSynced = 0;

  // Build list of traders to sync + optional leaderboard data
  let tradersToSync: { address: string; leaderboard?: PacificaLeaderboardEntry }[] = [];

  if (SYNC_CONFIG.trackedTraders.length > 0) {
    // Use configured traders
    tradersToSync = SYNC_CONFIG.trackedTraders
      .map((a) => a.trim())
      .filter(Boolean)
      .map((address) => ({ address }));

    logger.info("Using configured TRACKED_TRADERS", { count: tradersToSync.length });
  } else {
    // Auto-discover from Pacifica leaderboard
    logger.info("No TRACKED_TRADERS configured. Discovering from Pacifica leaderboard...");

    try {
      const leaderboard = await pacifica.getLeaderboard(100);

      // Pick top traders that have active positions (equity > $100 and positive OI)
      const activeTraders = leaderboard.filter((entry) => {
        const equity = parseFloat(entry.equity_current) || 0;
        const oi = parseFloat(entry.oi_current) || 0;
        return equity > 100 && oi > 0;
      });

      // Take top 20 active traders
      tradersToSync = activeTraders.slice(0, 20).map((entry) => ({
        address: entry.address,
        leaderboard: entry,
      }));

      logger.info(`Discovered ${tradersToSync.length} active traders from leaderboard`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to fetch leaderboard", { error: msg });
      return {
        success: false,
        tradersSynced: 0,
        strategiesSynced: 0,
        errors: [{ traderId: "leaderboard", error: msg, timestamp: Date.now() }],
        duration: Date.now() - startTime,
      };
    }
  }

  if (tradersToSync.length === 0) {
    logger.warn("No traders to sync.");
    return { success: true, tradersSynced: 0, strategiesSynced: 0, errors: [], duration: 0 };
  }

  // Sync each trader sequentially to respect rate limits
  for (const { address, leaderboard } of tradersToSync) {
    try {
      const result = await syncTrader(address, leaderboard);

      if (result.traderId) {
        tradersSynced++;
        strategiesSynced += result.strategiesCount;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push({
        traderId: address,
        error: errorMessage,
        timestamp: Date.now(),
      });
    }

    // Small delay between traders to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const duration = Date.now() - startTime;

  const result: SyncResult = {
    success: errors.length === 0,
    tradersSynced,
    strategiesSynced,
    errors,
    duration,
  };

  logger.success("Trader sync completed", {
    tradersSynced,
    strategiesSynced,
    errorsCount: errors.length,
    duration: `${duration}ms`,
  });

  return result;
}

/**
 * Sync a specific trader by address
 */
export async function syncTraderByAddress(traderAddress: string): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: SyncError[] = [];

  logger.info(`Starting sync for trader ${traderAddress}`);

  try {
    const result = await syncTrader(traderAddress);
    
    const duration = Date.now() - startTime;

    return {
      success: !!result.traderId,
      tradersSynced: result.traderId ? 1 : 0,
      strategiesSynced: result.strategiesCount,
      errors,
      duration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    errors.push({
      traderId: traderAddress,
      error: errorMessage,
      timestamp: Date.now(),
    });

    return {
      success: false,
      tradersSynced: 0,
      strategiesSynced: 0,
      errors,
      duration: Date.now() - startTime,
    };
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

// Allow running as: npx tsx src/server/sync/sync-traders.ts
if (typeof window === "undefined" && process.argv[1]?.includes("sync-traders")) {
  (async () => {
    console.log("\n🔄 Starting AlphaArena Trader Sync\n");
    const result = await syncAllTraders();
    
    console.log("\n📊 Sync Results:");
    console.log(`   Traders synced: ${result.tradersSynced}`);
    console.log(`   Strategies synced: ${result.strategiesSynced}`);
    console.log(`   Errors: ${result.errors.length}`);
    console.log(`   Duration: ${result.duration}ms\n`);
    
    if (result.errors.length > 0) {
      console.log("❌ Errors:");
      result.errors.forEach((e) => {
        console.log(`   - ${e.traderId}: ${e.error}`);
      });
      process.exit(1);
    }
    
    console.log("✅ Sync completed successfully!\n");
    process.exit(0);
  })();
}
