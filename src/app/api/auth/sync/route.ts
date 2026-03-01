import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveCompetition } from "@/server/competition/competition-service";
import { applyReferral } from "@/server/referral/referral-service";

/**
 * POST /api/auth/sync
 *
 * Sync Privy user to database.
 *
 * Body:
 * {
 *   privyUserId: string,
 *   walletAddress?: string | null,
 *   email?: string | null,
 *   displayName?: string | null,
 *   avatarUrl?: string | null,
 *   referralCode?: string | null  // Auto-apply referral on signup
 * }
 *
 * Behavior:
 * - Upsert User by privyUserId
 * - Generate referralCode if missing
 * - Auto-apply referral code for new users (from URL ?ref= param)
 * - Auto-join active competition
 * - Return db user
 * - Idempotent
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      privyUserId,
      walletAddress,
      email,
      displayName,
      avatarUrl,
      referralCode: incomingReferralCode,
    } = body;

    // Validate required fields
    if (!privyUserId) {
      return NextResponse.json(
        { error: "privyUserId is required" },
        { status: 400 }
      );
    }

    let isNewUser = false;

    // Upsert user
    const user = await prisma.$transaction(async (tx) => {
      // Check if user exists
      let existingUser = await tx.user.findUnique({
        where: { privyId: privyUserId },
      });

      if (existingUser) {
        // Update existing user
        const updatedUser = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            email: email || existingUser.email,
            displayName: displayName || existingUser.displayName,
            avatarUrl: avatarUrl || existingUser.avatarUrl,
            walletAddress: walletAddress || existingUser.walletAddress,
            updatedAt: new Date(),
          },
        });

        // Ensure referral code exists
        if (!updatedUser.referralCode) {
          const referralCode = await generateReferralCode(tx, updatedUser.id);
          return {
            ...updatedUser,
            referralCode,
          };
        }

        return updatedUser;
      }

      // Mark as new user for bootstrap
      isNewUser = true;

      // Create new user
      const newUser = await tx.user.create({
        data: {
          privyId: privyUserId,
          email,
          displayName,
          avatarUrl,
          walletAddress,
          referralPoints: 0,
          totalPnl: 0,
          totalAllocated: 0,
        },
      });

      // Generate referral code
      const referralCode = await generateReferralCode(tx, newUser.id);

      return {
        ...newUser,
        referralCode,
      };
    });

    // Auto-bootstrap for new users
    if (isNewUser) {
      // Auto-apply referral code if provided (from URL ?ref= param)
      if (incomingReferralCode) {
        try {
          const referralResult = await applyReferral(user.id, incomingReferralCode);
          if (referralResult.success) {
            console.log(`Auto-applied referral code ${incomingReferralCode} for new user ${user.id}`);
          } else {
            console.log(`Referral code ${incomingReferralCode} not applied: ${referralResult.message}`);
          }
        } catch (error) {
          console.error("Failed to auto-apply referral:", error);
        }
      }

      try {
        // Get or create active competition
        const competition = await getOrCreateActiveCompetition();

        // Auto-create leaderboard entry for new user
        await prisma.leaderboardEntry.upsert({
          where: {
            competitionId_userId: {
              competitionId: competition.id,
              userId: user.id,
            },
          },
          update: {},
          create: {
            competitionId: competition.id,
            userId: user.id,
            rank: null, // Will be calculated when leaderboard is refreshed
            pnlPercent: 0,
            pnlUsd: 0,
            totalAllocated: 0,
            copiedTradersCount: 0,
          },
        });

        console.log(`Auto-joined new user ${user.id} to competition ${competition.id}`);
      } catch (error) {
        console.error("Failed to auto-join competition:", error);
        // Don't fail the request if bootstrap fails
      }
    }

    // Format response
    const formattedUser = {
      id: user.id,
      privyId: user.privyId,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      walletAddress: user.walletAddress,
      referralCode: user.referralCode,
      referralPoints: user.referralPoints,
      totalPnl: user.totalPnl,
      totalAllocated: user.totalAllocated,
      createdAt: user.createdAt.toISOString(),
    };

    return NextResponse.json({
      success: true,
      user: formattedUser,
      isNewUser,
    });
  } catch (error) {
    console.error("Error syncing user:", error);
    
    return NextResponse.json(
      {
        error: "Failed to sync user",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Generate a unique referral code for a user
 */
async function generateReferralCode(
  tx: any,
  userId: string,
  maxRetries: number = 10
): Promise<string> {
  // Get user info
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { username: true, displayName: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Try to create code from username/display name
  const baseName = (user.username || user.displayName || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  
  if (baseName) {
    const codeFromName = `ALPHA-${baseName.slice(0, 8)}`;
    
    const existing = await tx.user.findUnique({
      where: { referralCode: codeFromName },
    });

    if (!existing || existing.id === userId) {
      await tx.user.update({
        where: { id: userId },
        data: { referralCode: codeFromName },
      });
      return codeFromName;
    }
  }

  // Generate random code with retry
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  
  for (let i = 0; i < maxRetries; i++) {
    let randomPart = "";
    for (let j = 0; j < 8; j++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const code = `ALPHA-${randomPart}`;

    const existing = await tx.user.findUnique({
      where: { referralCode: code },
    });

    if (!existing) {
      await tx.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
      return code;
    }
  }

  throw new Error("Failed to generate unique referral code");
}
