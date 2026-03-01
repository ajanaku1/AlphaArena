import { NextRequest, NextResponse } from "next/server";
import { applyReferral } from "@/server/referral/referral-service";
import { requireAuthAndResolve } from "@/lib/auth/middleware";

/**
 * POST /api/referrals/apply
 *
 * Apply a referral code to a user.
 *
 * Requires authentication.
 *
 * Body:
 * {
 *   referralCode: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication and resolve wallet → internal user
    const authResult = await requireAuthAndResolve(request);
    if (authResult instanceof NextResponse) return authResult;

    const { userId } = authResult;

    const body = await request.json();
    const { referralCode } = body;

    // Validate required fields
    if (!referralCode) {
      return NextResponse.json(
        { error: "referralCode is required" },
        { status: 400 }
      );
    }

    // Apply referral
    const result = await applyReferral(userId, referralCode);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      data: {
        pointsAwarded: result.pointsAwarded,
      },
    });
  } catch {
    // DB unavailable — referral system not available
    return NextResponse.json(
      { error: "Referral system is temporarily unavailable. Please try again later." },
      { status: 503 }
    );
  }
}
