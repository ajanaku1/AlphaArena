/**
 * Trading Royale Scheduled Jobs
 * 
 * Cron-like jobs for competition management:
 * - Leaderboard refresh (every 5 minutes)
 * - Weekly competition rollover
 * 
 * Safe to run repeatedly (idempotent).
 * 
 * Usage:
 *   npx tsx src/server/competition/cron.ts
 * 
 * Or set up in your cron provider:
 *   Every 5 minutes - Leaderboard refresh
 *   Monday 00:00 UTC - Weekly rollover
 */

import {
  getOrCreateActiveCompetition,
  calculateLeaderboard,
  finalizeCompetition,
} from "./competition-service";
import { prisma } from "@/lib/prisma";

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Job timeouts
  leaderboardTimeout: 30000, // 30 seconds
  rolloverTimeout: 60000, // 60 seconds
};

// ============================================================================
// Logger
// ============================================================================

const logger = {
  info: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Cron] [INFO] ${message}`, data ? JSON.stringify(data) : "");
  },
  warn: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [Cron] [WARN] ${message}`, data ? JSON.stringify(data) : "");
  },
  error: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [Cron] [ERROR] ${message}`, data ? JSON.stringify(data) : "");
  },
  success: (message: string, data?: unknown) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Cron] [SUCCESS] ${message}`, data ? JSON.stringify(data) : "");
  },
};

// ============================================================================
// Jobs
// ============================================================================

/**
 * Refresh the leaderboard for the active competition
 * 
 * Runs every 5 minutes to keep rankings up to date.
 * Safe to run repeatedly - uses upserts.
 */
export async function refreshLeaderboardJob(): Promise<void> {
  logger.info("Starting leaderboard refresh job");

  const timeout = setTimeout(() => {
    logger.warn("Leaderboard refresh job timed out");
    process.exit(1);
  }, CONFIG.leaderboardTimeout);

  try {
    // Get or create active competition
    const competition = await getOrCreateActiveCompetition();
    
    // Calculate leaderboard
    const entries = await calculateLeaderboard(competition.id);

    logger.success("Leaderboard refresh completed", {
      competitionId: competition.id,
      entriesCount: entries.length,
    });

    clearTimeout(timeout);
  } catch (error) {
    clearTimeout(timeout);
    logger.error("Leaderboard refresh job failed", error);
    process.exit(1);
  }
}

/**
 * Weekly competition rollover
 * 
 * Runs every Monday at 00:00 UTC to:
 * - Finalize last week's competition
 * - Create new week's competition
 * 
 * Safe to run repeatedly - checks competition status.
 */
export async function weeklyRolloverJob(): Promise<void> {
  logger.info("Starting weekly rollover job");

  const timeout = setTimeout(() => {
    logger.warn("Weekly rollover job timed out");
    process.exit(1);
  }, CONFIG.rolloverTimeout);

  try {
    const now = new Date();

    // Find any active competitions that should be completed
    const activeCompetitions = await prisma.competition.findMany({
      where: {
        status: "ACTIVE",
        endAt: { lt: now },
      },
    });

    logger.info(`Found ${activeCompetitions.length} competitions to finalize`);

    // Finalize each completed competition
    for (const competition of activeCompetitions) {
      logger.info(`Finalizing competition: ${competition.name}`);
      await finalizeCompetition(competition.id);
    }

    // Create new competition for current week
    const newCompetition = await getOrCreateActiveCompetition();
    
    logger.success("Weekly rollover completed", {
      newCompetitionId: newCompetition.id,
      newCompetitionName: newCompetition.name,
    });

    clearTimeout(timeout);
  } catch (error) {
    clearTimeout(timeout);
    logger.error("Weekly rollover job failed", error);
    process.exit(1);
  }
}

/**
 * Run all jobs (for testing)
 */
export async function runAllJobs(): Promise<void> {
  logger.info("Running all cron jobs");

  try {
    await refreshLeaderboardJob();
    await weeklyRolloverJob();
    
    logger.success("All cron jobs completed");
  } catch (error) {
    logger.error("Cron jobs failed", error);
    process.exit(1);
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

const args = process.argv.slice(2);
const job = args[0];

if (typeof window === "undefined" && require.main === module) {
  (async () => {
    console.log("\n🕐 AlphaArena Competition Cron\n");

    switch (job) {
      case "leaderboard":
        await refreshLeaderboardJob();
        break;
      case "rollover":
        await weeklyRolloverJob();
        break;
      case "all":
        await runAllJobs();
        break;
      default:
        console.log("Usage: npx tsx src/server/competition/cron.ts <job>");
        console.log("");
        console.log("Jobs:");
        console.log("  leaderboard  - Refresh leaderboard for active competition");
        console.log("  rollover     - Weekly competition rollover");
        console.log("  all          - Run all jobs");
        console.log("");
        process.exit(0);
    }

    console.log("\n✅ Job completed successfully!\n");
    process.exit(0);
  })();
}
