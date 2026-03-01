/**
 * Badge Service
 *
 * Expanded badge system supporting 10 badge types across copy-trading,
 * referrals, and competition achievements.
 *
 * Badge Types:
 *   Competition: ROYAL_WINNER, TOP_10, TOP_50, PROFIT_MASTER, COMEBACK_KING
 *   Copy Trading: FIRST_COPY, DIVERSIFIER, WHALE
 *   Referrals: REFERRER, INFLUENCER
 */

import { prisma } from "@/lib/prisma";

// ============================================================================
// Types
// ============================================================================

export type BadgeType =
  | "ROYAL_WINNER"
  | "TOP_10"
  | "TOP_50"
  | "FIRST_COPY"
  | "DIVERSIFIER"
  | "WHALE"
  | "REFERRER"
  | "INFLUENCER"
  | "PROFIT_MASTER"
  | "COMEBACK_KING";

// ============================================================================
// Logger
// ============================================================================

const logger = {
  info: (msg: string, data?: unknown) =>
    console.log(`[BadgeService] [INFO] ${msg}`, data ? JSON.stringify(data) : ""),
  error: (msg: string, data?: unknown) =>
    console.error(`[BadgeService] [ERROR] ${msg}`, data ? JSON.stringify(data) : ""),
};

// ============================================================================
// Core: Idempotent Badge Award
// ============================================================================

/**
 * Award a badge to a user. Idempotent — skips if the user already has
 * the same badge type (optionally scoped to a competitionId).
 */
export async function awardBadge(
  userId: string,
  type: BadgeType,
  opts?: { competitionId?: string; metadata?: Record<string, unknown> }
): Promise<boolean> {
  try {
    // Check for existing badge of this type for the user
    const existing = await prisma.badge.findFirst({
      where: {
        userId,
        type,
        ...(opts?.competitionId ? { competitionId: opts.competitionId } : {}),
      },
    });

    if (existing) {
      return false; // Already awarded
    }

    await prisma.badge.create({
      data: {
        userId,
        type,
        competitionId: opts?.competitionId ?? null,
        metadata: opts?.metadata ? JSON.stringify(opts.metadata) : null,
      },
    });

    logger.info(`Awarded ${type} badge to user ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to award ${type} badge`, error);
    return false;
  }
}

// ============================================================================
// Copy Trading Badges
// ============================================================================

/**
 * Check and award copy-trading badges after a successful copy.
 *
 * - FIRST_COPY: User's very first copy trade
 * - DIVERSIFIER: 5+ different traders copied
 * - WHALE: $10K+ total allocated
 */
export async function checkCopyBadges(userId: string): Promise<void> {
  try {
    // Get copy stats
    const [totalCopies, distinctTraders, user] = await Promise.all([
      prisma.copyPosition.count({ where: { userId } }),
      prisma.copyPosition.groupBy({
        by: ["traderId"],
        where: { userId },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { totalAllocated: true },
      }),
    ]);

    // FIRST_COPY: first copy ever (the count includes the one just created)
    if (totalCopies >= 1) {
      await awardBadge(userId, "FIRST_COPY", {
        metadata: { awardedAt: new Date().toISOString() },
      });
    }

    // DIVERSIFIER: 5+ different traders
    if (distinctTraders.length >= 5) {
      await awardBadge(userId, "DIVERSIFIER", {
        metadata: { tradersCount: distinctTraders.length },
      });
    }

    // WHALE: $10K+ total allocated
    if (user && user.totalAllocated >= 10_000) {
      await awardBadge(userId, "WHALE", {
        metadata: { totalAllocated: user.totalAllocated },
      });
    }
  } catch (error) {
    logger.error("checkCopyBadges failed", error);
  }
}

// ============================================================================
// Referral Badges
// ============================================================================

/**
 * Check and award referral badges after a successful referral.
 *
 * - REFERRER: First successful referral
 * - INFLUENCER: 10+ successful referrals
 */
export async function checkReferralBadges(referrerId: string): Promise<void> {
  try {
    const referralCount = await prisma.referral.count({
      where: { referrerId },
    });

    // REFERRER: first referral
    if (referralCount >= 1) {
      await awardBadge(referrerId, "REFERRER", {
        metadata: { referralCount },
      });
    }

    // INFLUENCER: 10+ referrals
    if (referralCount >= 10) {
      await awardBadge(referrerId, "INFLUENCER", {
        metadata: { referralCount },
      });
    }
  } catch (error) {
    logger.error("checkReferralBadges failed", error);
  }
}

// ============================================================================
// Competition Badges
// ============================================================================

/**
 * Check and award competition-specific badges for a single entry.
 *
 * - PROFIT_MASTER: 50%+ PnL return in a competition
 * - COMEBACK_KING: Rank improved by 10+ positions from previous competition
 */
export async function checkCompetitionBadges(
  userId: string,
  competitionId: string,
  data: { pnlPercent: number; rank: number }
): Promise<void> {
  try {
    // PROFIT_MASTER: 50%+ PnL in the competition
    if (data.pnlPercent >= 50) {
      await awardBadge(userId, "PROFIT_MASTER", {
        competitionId,
        metadata: { pnlPercent: data.pnlPercent },
      });
    }

    // COMEBACK_KING: rank improved by 10+ from previous competition
    const previousEntry = await prisma.leaderboardEntry.findFirst({
      where: {
        userId,
        competitionId: { not: competitionId },
      },
      orderBy: { createdAt: "desc" },
    });

    if (previousEntry?.rank && data.rank) {
      const improvement = previousEntry.rank - data.rank;
      if (improvement >= 10) {
        await awardBadge(userId, "COMEBACK_KING", {
          competitionId,
          metadata: {
            previousRank: previousEntry.rank,
            currentRank: data.rank,
            improvement,
          },
        });
      }
    }
  } catch (error) {
    logger.error("checkCompetitionBadges failed", error);
  }
}
