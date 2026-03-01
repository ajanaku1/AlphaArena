/**
 * Referral Service
 * 
 * Manages user referrals, referral codes, and points system.
 * Integrates with Fuul for external referral tracking.
 * 
 * Features:
 * - Unique referral code generation
 * - Referral application with validation
 * - Points award system
 * - Referral stats and leaderboard
 */

import { prisma } from "@/lib/prisma";
import type { User, Referral } from "@prisma/client";
import { checkReferralBadges } from "@/server/badges/badge-service";

// ============================================================================
// Configuration
// ============================================================================

const REFERRAL_CONFIG = {
  // Points awarded for successful referral
  signupBonus: 100,      // Points when someone signs up with your code
  tradingBonus: 500,     // Points when referral makes first trade
  
  // Referral code settings
  codeLength: 8,
  codePrefix: "ALPHA",
  
  // Rate limiting
  maxReferralsPerDay: 100,
};

// ============================================================================
// Types
// ============================================================================

export interface ReferralStats {
  totalReferrals: number;
  totalPoints: number;
  referralCode: string | null;
  recentReferrals: ReferralWithUser[];
}

export interface ReferralWithUser extends Referral {
  referredUser: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface ReferralLeaderboardEntry {
  userId: string;
  username: string;
  avatarUrl: string | null;
  referralPoints: number;
  totalReferrals: number;
  rank: number;
}

// ============================================================================
// Logger
// ============================================================================

const logger = {
  info: (message: string, data?: unknown) => {
    console.log(`[Referral] [INFO] ${message}`, data ? JSON.stringify(data) : "");
  },
  warn: (message: string, data?: unknown) => {
    console.warn(`[Referral] [WARN] ${message}`, data ? JSON.stringify(data) : "");
  },
  error: (message: string, data?: unknown) => {
    console.error(`[Referral] [ERROR] ${message}`, data ? JSON.stringify(data) : "");
  },
  success: (message: string, data?: unknown) => {
    console.log(`[Referral] [SUCCESS] ${message}`, data ? JSON.stringify(data) : "");
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a random alphanumeric code
 */
function generateRandomCode(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique referral code for a user
 */
export async function generateReferralCode(userId: string): Promise<string> {
  logger.info("Generating referral code", { userId });

  // Get user info for personalized code
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, displayName: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Try to create code from username/display name
  const baseName = (user.username || user.displayName || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  
  if (baseName) {
    const codeFromName = `${REFERRAL_CONFIG.codePrefix}-${baseName.slice(0, 8)}`;
    
    // Check if this code is available
    const existing = await prisma.user.findUnique({
      where: { referralCode: codeFromName },
    });

    if (!existing || existing.id === userId) {
      logger.info("Generated code from username", { code: codeFromName });
      return codeFromName;
    }
  }

  // Generate random code with retry
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    const randomPart = generateRandomCode(REFERRAL_CONFIG.codeLength);
    const code = `${REFERRAL_CONFIG.codePrefix}-${randomPart}`;

    const existing = await prisma.user.findUnique({
      where: { referralCode: code },
    });

    if (!existing) {
      logger.info("Generated random code", { code });
      return code;
    }
  }

  throw new Error("Failed to generate unique referral code after multiple attempts");
}

/**
 * Ensure user has a referral code, generate if not exists
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  if (user?.referralCode) {
    return user.referralCode;
  }

  // Generate and assign code
  const code = await generateReferralCode(userId);
  
  await prisma.user.update({
    where: { id: userId },
    data: { referralCode: code },
  });

  return code;
}

// ============================================================================
// Core Referral Functions
// ============================================================================

/**
 * Apply a referral code to a new user
 * 
 * - Validates the code
 * - Prevents self-referral
 * - Creates referral record
 * - Awards points to referrer
 * - Idempotent (safe to call multiple times)
 */
export async function applyReferral(
  newUserId: string,
  referralCode: string
): Promise<{ success: boolean; message: string; pointsAwarded?: number }> {
  logger.info("Applying referral code", { newUserId, referralCode });

  try {
    // Check if user already has a referral
    const existingUser = await prisma.user.findUnique({
      where: { id: newUserId },
      select: { referredByUserId: true },
    });

    if (existingUser?.referredByUserId) {
      return {
        success: false,
        message: "User already has a referral",
      };
    }

    // Find referrer by code
    const referrer = await prisma.user.findUnique({
      where: { referralCode: referralCode.toUpperCase() },
    });

    if (!referrer) {
      return {
        success: false,
        message: "Invalid referral code",
      };
    }

    // Prevent self-referral
    if (referrer.id === newUserId) {
      return {
        success: false,
        message: "Cannot refer yourself",
      };
    }

    // Check for existing referral record (idempotency)
    const existingReferral = await prisma.referral.findUnique({
      where: {
        referrerId_referredUserId: {
          referrerId: referrer.id,
          referredUserId: newUserId,
        },
      },
    });

    if (existingReferral) {
      return {
        success: true,
        message: "Referral already applied",
        pointsAwarded: existingReferral.pointsAwarded,
      };
    }

    // Create referral record and award points
    const result = await prisma.$transaction(async (tx) => {
      // Create referral record
      const referral = await tx.referral.create({
        data: {
          referrerId: referrer.id,
          referredUserId: newUserId,
          referralCode: referralCode.toUpperCase(),
          pointsAwarded: REFERRAL_CONFIG.signupBonus,
          source: "internal",
        },
      });

      // Award points to referrer
      await tx.user.update({
        where: { id: referrer.id },
        data: {
          referralPoints: { increment: REFERRAL_CONFIG.signupBonus },
        },
      });

      // Update new user with referrer
      await tx.user.update({
        where: { id: newUserId },
        data: {
          referredByUserId: referrer.id,
        },
      });

      return referral;
    });

    logger.success("Referral applied successfully", {
      referrerId: referrer.id,
      newUserId,
      pointsAwarded: REFERRAL_CONFIG.signupBonus,
    });

    // Check referral badges (non-blocking)
    checkReferralBadges(referrer.id).catch((err) =>
      logger.error("Referral badge check failed", err)
    );

    return {
      success: true,
      message: "Referral applied successfully",
      pointsAwarded: REFERRAL_CONFIG.signupBonus,
    };
  } catch (error) {
    logger.error("Failed to apply referral", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to apply referral",
    };
  }
}

/**
 * Award referral points to a user
 * 
 * - Updates user.referralPoints
 * - Creates Referral record for tracking
 * - Supports both Fuul and internal sources
 */
export async function awardReferralPoints(
  referrerUserId: string,
  amount: number,
  options?: {
    referredUserId?: string;
    source?: "fuul" | "internal";
    fuulReferralId?: string;
    description?: string;
  }
): Promise<{ success: boolean; newTotal: number }> {
  logger.info("Awarding referral points", {
    referrerUserId,
    amount,
    ...options,
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Award points to user
      const user = await tx.user.update({
        where: { id: referrerUserId },
        data: {
          referralPoints: { increment: amount },
        },
      });

      // Create referral record if we have a referred user
      if (options?.referredUserId) {
        await tx.referral.create({
          data: {
            referrerId: referrerUserId,
            referredUserId: options.referredUserId,
            referralCode: "BONUS",
            pointsAwarded: amount,
            source: options.source || "internal",
            fuulReferralId: options.fuulReferralId,
          },
        });
      }

      return user;
    });

    logger.success("Points awarded", {
      referrerUserId,
      amount,
      newTotal: result.referralPoints,
    });

    return {
      success: true,
      newTotal: result.referralPoints,
    };
  } catch (error) {
    logger.error("Failed to award points", error);
    return {
      success: false,
      newTotal: 0,
    };
  }
}

/**
 * Get referral stats for a user
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  logger.info("Getting referral stats", { userId });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      referralCode: true,
      referralPoints: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Get referral count
  const totalReferrals = await prisma.referral.count({
    where: { referrerId: userId },
  });

  // Get recent referrals
  const recentReferrals = await prisma.referral.findMany({
    where: { referrerId: userId },
    include: {
      referredUser: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return {
    totalReferrals,
    totalPoints: user.referralPoints,
    referralCode: user.referralCode,
    recentReferrals: recentReferrals as ReferralWithUser[],
  };
}

/**
 * Get referral leaderboard
 * 
 * - Sorted by referralPoints descending
 * - Includes total referrals count
 * - Paginated
 */
export async function getReferralLeaderboard(
  limit: number = 50
): Promise<ReferralLeaderboardEntry[]> {
  logger.info("Getting referral leaderboard", { limit });

  // Get top users by referral points
  const users = await prisma.user.findMany({
    where: {
      referralPoints: { gt: 0 },
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      referralPoints: true,
      _count: {
        select: {
          referralsSent: true,
        },
      },
    },
    orderBy: { referralPoints: "desc" },
    take: limit,
  });

  // Map to leaderboard entries with rank
  return users.map((user, index) => ({
    userId: user.id,
    username: user.username || user.displayName || `Trader_${user.id.slice(0, 6)}`,
    avatarUrl: user.avatarUrl,
    referralPoints: user.referralPoints,
    totalReferrals: user._count.referralsSent,
    rank: index + 1,
  }));
}

/**
 * Check if a user is eligible for the first-trade referral bonus and award it.
 *
 * Called when a user makes their first copy trade. Awards the trading bonus
 * to the referrer who brought this user in.
 *
 * - Only awards once (checks for existing trading bonus referral)
 * - Only awards if user was referred by someone
 */
export async function checkAndAwardFirstTradeBonus(userId: string): Promise<void> {
  logger.info("Checking first trade bonus eligibility", { userId });

  try {
    // Check if user was referred by someone
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referredByUserId: true },
    });

    if (!user?.referredByUserId) {
      logger.info("User has no referrer, skipping first trade bonus");
      return;
    }

    // Check if user has already made a copy trade before (more than 1 means not first)
    const copyCount = await prisma.copyPosition.count({
      where: { userId },
    });

    // Only award on first trade (the one that just happened)
    if (copyCount > 1) {
      logger.info("User already has previous trades, skipping first trade bonus");
      return;
    }

    // Check if trading bonus was already awarded for this referral pair
    const existingBonus = await prisma.referral.findFirst({
      where: {
        referrerId: user.referredByUserId,
        referredUserId: userId,
        pointsAwarded: { gt: REFERRAL_CONFIG.signupBonus },
        source: "internal",
      },
    });

    if (existingBonus) {
      logger.info("First trade bonus already awarded, skipping");
      return;
    }

    // Award trading bonus to the referrer
    await awardReferralPoints(user.referredByUserId, REFERRAL_CONFIG.tradingBonus, {
      referredUserId: userId,
      source: "internal",
      description: "Referral first trade bonus",
    });

    logger.success("First trade bonus awarded", {
      referrerId: user.referredByUserId,
      referredUserId: userId,
      points: REFERRAL_CONFIG.tradingBonus,
    });
  } catch (error) {
    logger.error("Failed to check/award first trade bonus", error);
  }
}

/**
 * Get user's referrer (who referred them)
 */
export async function getUsersReferrer(userId: string): Promise<{
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      referredByUserId: true,
    },
  });

  if (!user?.referredByUserId) {
    return null;
  }

  const referrer = await prisma.user.findUnique({
    where: { id: user.referredByUserId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  });

  return referrer;
}
