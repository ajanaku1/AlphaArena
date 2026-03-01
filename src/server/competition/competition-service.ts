/**
 * Trading Royale Competition Service
 * 
 * Manages weekly competitions, leaderboard calculation, and badge rewards.
 * 
 * Features:
 * - Weekly auto-created competitions
 * - Real-time leaderboard calculation
 * - Badge rewards for top performers
 * - Deterministic week boundaries (Monday 00:00 UTC)
 */

import { prisma } from "@/lib/prisma";
import type { Competition, LeaderboardEntry, Badge, User } from "@prisma/client";
import { checkCompetitionBadges } from "@/server/badges/badge-service";

// ============================================================================
// Types
// ============================================================================

export interface LeaderboardEntryWithUser extends LeaderboardEntry {
  user: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface CompetitionWithEntries extends Competition {
  leaderboardEntries: LeaderboardEntryWithUser[];
}

export interface BadgeWithCompetition extends Badge {
  competition: Competition | null;
}

export interface LeaderboardResult {
  competition: Competition;
  entries: LeaderboardEntryWithUser[];
  userEntry?: LeaderboardEntryWithUser;
}

// ============================================================================
// Logger
// ============================================================================

const logger = {
  info: (message: string, data?: unknown) => {
    console.log(`[Competition] [INFO] ${message}`, data ? JSON.stringify(data) : "");
  },
  warn: (message: string, data?: unknown) => {
    console.warn(`[Competition] [WARN] ${message}`, data ? JSON.stringify(data) : "");
  },
  error: (message: string, data?: unknown) => {
    console.error(`[Competition] [ERROR] ${message}`, data ? JSON.stringify(data) : "");
  },
  success: (message: string, data?: unknown) => {
    console.log(`[Competition] [SUCCESS] ${message}`, data ? JSON.stringify(data) : "");
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the start of the current week (Monday 00:00 UTC)
 */
function getWeekStart(date: Date = new Date()): Date {
  const result = new Date(date);
  const day = result.getUTCDay();
  const diff = result.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  result.setUTCDate(diff);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of the current week (Sunday 23:59:59 UTC)
 */
function getWeekEnd(date: Date = new Date()): Date {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  weekEnd.setUTCMilliseconds(-1);
  return weekEnd;
}

/**
 * Generate competition name for a given week
 */
function getCompetitionName(weekStart: Date): string {
  const weekNumber = getWeekNumber(weekStart);
  const year = weekStart.getUTCFullYear();
  return `Trading Royale - Week ${weekNumber}, ${year}`;
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ============================================================================
// Core Competition Functions
// ============================================================================

/**
 * Get or create the active weekly competition
 * 
 * - Checks for existing active competition
 * - Auto-creates if none exists or if current week has passed
 * - Deterministic week boundaries (Monday 00:00 UTC)
 */
export async function getOrCreateActiveCompetition(): Promise<Competition> {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);

  logger.info("Getting or creating active competition", { weekStart, weekEnd });

  try {
    // Check for existing active competition
    const existingActive = await prisma.competition.findFirst({
      where: {
        status: "ACTIVE",
        startAt: { lte: now },
        endAt: { gte: now },
      },
    });

    if (existingActive) {
      // Check if it's still the current week
      const existingWeekStart = getWeekStart(existingActive.startAt);
      if (existingWeekStart.getTime() === weekStart.getTime()) {
        logger.info("Found existing active competition", { id: existingActive.id });
        return existingActive;
      }
      
      // Old competition, mark as completed
      await finalizeCompetition(existingActive.id);
    }

    // Check if competition for this week already exists
    const existingWeekCompetition = await prisma.competition.findFirst({
      where: {
        startAt: { gte: weekStart, lt: new Date(weekStart.getTime() + 86400000) }, // Within 24h of week start
      },
    });

    if (existingWeekCompetition) {
      logger.info("Found existing competition for this week", { id: existingWeekCompetition.id });
      return existingWeekCompetition;
    }

    // Create new competition for this week
    const name = getCompetitionName(weekStart);
    
    const competition = await prisma.competition.create({
      data: {
        name,
        description: `Weekly Trading Royale competition. Compete for the crown and earn exclusive badges!`,
        startAt: weekStart,
        endAt: weekEnd,
        status: "ACTIVE",
        prizePool: 1750, // $1000 + $500 + $250
        firstPlacePrize: 1000,
        secondPlacePrize: 500,
        thirdPlacePrize: 250,
        maxParticipants: null, // Unlimited for now
      },
    });

    logger.success("Created new competition", { id: competition.id, name });
    return competition;
  } catch (error) {
    logger.error("Failed to get or create competition", error);
    throw error;
  }
}

/**
 * Calculate and update the leaderboard for a competition
 * 
 * - Pulls all users with portfolios
 * - Computes pnlPercent: (totalPnl / totalAllocated) * 100
 * - Ranks users by pnlPercent descending
 * - Upserts LeaderboardEntry records
 * - Efficient batching
 */
export async function calculateLeaderboard(competitionId: string): Promise<LeaderboardEntry[]> {
  logger.info("Calculating leaderboard", { competitionId });

  try {
    // Get all users with copy positions (active traders)
    const users = await prisma.user.findMany({
      where: {
        copyPositions: {
          some: {},
        },
      },
      include: {
        copyPositions: {
          where: { status: "OPEN" },
        },
      },
    });

    logger.info(`Found ${users.length} active traders`);

    if (users.length === 0) {
      return [];
    }

    // Calculate metrics for each user
    const entriesData = users.map((user) => {
      const totalAllocated = user.copyPositions.reduce(
        (sum, pos) => sum + pos.allocationUsd,
        0
      );
      const totalPnl = user.copyPositions.reduce(
        (sum, pos) => sum + pos.pnl,
        0
      );
      const pnlPercent = totalAllocated > 0 ? (totalPnl / totalAllocated) * 100 : 0;
      const copiedTradersCount = new Set(user.copyPositions.map((p) => p.traderId)).size;

      return {
        userId: user.id,
        pnlPercent,
        pnlUsd: totalPnl,
        totalAllocated,
        copiedTradersCount,
      };
    });

    // Sort by pnlPercent descending
    entriesData.sort((a, b) => b.pnlPercent - a.pnlPercent);

    // Add rank
    const entriesWithRank = entriesData.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    // Upsert leaderboard entries in batch
    const upserts = entriesWithRank.map((entry) =>
      prisma.leaderboardEntry.upsert({
        where: {
          competitionId_userId: {
            competitionId,
            userId: entry.userId,
          },
        },
        update: {
          rank: entry.rank,
          pnlPercent: entry.pnlPercent,
          pnlUsd: entry.pnlUsd,
          totalAllocated: entry.totalAllocated,
          copiedTradersCount: entry.copiedTradersCount,
        },
        create: {
          competitionId,
          userId: entry.userId,
          rank: entry.rank,
          pnlPercent: entry.pnlPercent,
          pnlUsd: entry.pnlUsd,
          totalAllocated: entry.totalAllocated,
          copiedTradersCount: entry.copiedTradersCount,
        },
      })
    );

    // Execute in batches
    const BATCH_SIZE = 50;
    const results: LeaderboardEntry[] = [];
    
    for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
      const batch = upserts.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }

    // Update competition participant count
    await prisma.competition.update({
      where: { id: competitionId },
      data: {
        totalParticipants: entriesWithRank.length,
      },
    });

    logger.success("Leaderboard calculated", { 
      entriesCount: results.length,
      topPnlPercent: entriesWithRank[0]?.pnlPercent,
    });

    return results;
  } catch (error) {
    logger.error("Failed to calculate leaderboard", error);
    throw error;
  }
}

/**
 * Finalize a competition and assign badges
 * 
 * - Marks competition as COMPLETED
 * - Assigns badges:
 *   - Rank 1 → ROYAL_WINNER
 *   - Rank 2-10 → TOP_10
 *   - Rank 11-50 → TOP_50
 * - Awards prizes
 */
export async function finalizeCompetition(competitionId: string): Promise<void> {
  logger.info("Finalizing competition", { competitionId });

  try {
    // Get final leaderboard
    const entries = await prisma.leaderboardEntry.findMany({
      where: { competitionId },
      orderBy: { rank: "asc" },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    // Get competition details
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new Error("Competition not found");
    }

    // Award prizes and badges
    const badgePromises: Promise<Badge>[] = [];

    for (const entry of entries) {
      const rank = entry.rank || 999;
      let badgeType: string | null = null;
      let prizeWon = 0;

      // Determine badge type
      if (rank === 1) {
        badgeType = "ROYAL_WINNER";
        prizeWon = competition.firstPlacePrize;
      } else if (rank <= 10) {
        badgeType = "TOP_10";
        prizeWon = rank === 2 ? competition.secondPlacePrize : 
                   rank === 3 ? competition.thirdPlacePrize : 0;
      } else if (rank <= 50) {
        badgeType = "TOP_50";
      }

      // Update prize
      if (prizeWon > 0) {
        await prisma.leaderboardEntry.update({
          where: { id: entry.id },
          data: { prizeWon, isClaimed: false },
        });
      }

      // Create badge
      if (badgeType) {
        badgePromises.push(
          prisma.badge.create({
            data: {
              userId: entry.userId,
              competitionId,
              type: badgeType,
              metadata: JSON.stringify({
                rank,
                pnlPercent: entry.pnlPercent,
                competitionName: competition.name,
              }),
            },
          })
        );
      }

      // Check expanded competition badges (PROFIT_MASTER, COMEBACK_KING)
      checkCompetitionBadges(entry.userId, competitionId, {
        pnlPercent: entry.pnlPercent,
        rank,
      }).catch(() => {});
    }

    await Promise.all(badgePromises);

    // Mark competition as completed
    await prisma.competition.update({
      where: { id: competitionId },
      data: { status: "COMPLETED" },
    });

    logger.success("Competition finalized", { 
      competitionId,
      badgesAwarded: badgePromises.length,
    });
  } catch (error) {
    logger.error("Failed to finalize competition", error);
    throw error;
  }
}

/**
 * Get active competition with leaderboard
 */
export async function getActiveCompetitionWithLeaderboard(
  limit: number = 50,
  userId?: string
): Promise<LeaderboardResult> {
  const competition = await getOrCreateActiveCompetition();
  
  // Ensure leaderboard is up to date
  await calculateLeaderboard(competition.id);

  // Get leaderboard entries
  const entries = await prisma.leaderboardEntry.findMany({
    where: { competitionId: competition.id },
    orderBy: { rank: "asc" },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  // Get user's entry if provided
  let userEntry: LeaderboardEntryWithUser | undefined;
  if (userId) {
    const entry = await prisma.leaderboardEntry.findUnique({
      where: {
        competitionId_userId: {
          competitionId: competition.id,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
    userEntry = entry || undefined;
  }

  return {
    competition,
    entries: entries as LeaderboardEntryWithUser[],
    userEntry,
  };
}

/**
 * Get user's badges
 */
export async function getUserBadges(userId: string): Promise<BadgeWithCompetition[]> {
  const badges = await prisma.badge.findMany({
    where: { userId },
    include: {
      competition: {
        select: {
          id: true,
          name: true,
          startAt: true,
          endAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return badges as BadgeWithCompetition[];
}

/**
 * Get badge counts for a user
 */
export async function getUserBadgeCounts(userId: string): Promise<{
  total: number;
  royalWinner: number;
  top10: number;
  top50: number;
  firstCopy: number;
  diversifier: number;
  whale: number;
  referrer: number;
  influencer: number;
  profitMaster: number;
  comebackKing: number;
}> {
  const badges = await prisma.badge.groupBy({
    by: ["type"],
    where: { userId },
    _count: true,
  });

  const counts = {
    total: 0,
    royalWinner: 0,
    top10: 0,
    top50: 0,
    firstCopy: 0,
    diversifier: 0,
    whale: 0,
    referrer: 0,
    influencer: 0,
    profitMaster: 0,
    comebackKing: 0,
  };

  for (const badge of badges) {
    const count = badge._count;
    counts.total += count;

    switch (badge.type) {
      case "ROYAL_WINNER":
        counts.royalWinner += count;
        break;
      case "TOP_10":
        counts.top10 += count;
        break;
      case "TOP_50":
        counts.top50 += count;
        break;
      case "FIRST_COPY":
        counts.firstCopy += count;
        break;
      case "DIVERSIFIER":
        counts.diversifier += count;
        break;
      case "WHALE":
        counts.whale += count;
        break;
      case "REFERRER":
        counts.referrer += count;
        break;
      case "INFLUENCER":
        counts.influencer += count;
        break;
      case "PROFIT_MASTER":
        counts.profitMaster += count;
        break;
      case "COMEBACK_KING":
        counts.comebackKing += count;
        break;
    }
  }

  return counts;
}
