import { NextRequest, NextResponse } from "next/server";
import { awardReferralPoints } from "@/server/referral/referral-service";

/**
 * POST /api/fuul/webhook
 * 
 * Fuul webhook for referral events.
 * 
 * Fuul sends events when:
 * - A referral signs up
 * - A referral completes a milestone (first trade, etc.)
 * 
 * This endpoint:
 * - Verifies signature (stub for now)
 * - Maps Fuul event to referral points
 * - Awards points to referrer
 * - Logs safely
 * - Is idempotent
 * 
 * Fuul Event Types:
 * - referral.signup - New user signed up via referral
 * - referral.trading - Referral made first trade
 * - referral.volume - Referral reached volume milestone
 */
export async function POST(request: NextRequest) {
  const logger = {
    info: (msg: string, data?: unknown) => console.log(`[Fuul Webhook] [INFO] ${msg}`, data),
    error: (msg: string, data?: unknown) => console.error(`[Fuul Webhook] [ERROR] ${msg}`, data),
  };

  logger.info("Received Fuul webhook");

  try {
    // Verify Fuul signature (stub - implement real verification in production)
    const signature = request.headers.get("x-fuul-signature");
    const fuulApiKey = process.env.FUUL_API_KEY;

    // In production, verify the signature here
    // For now, we accept all requests (stub)
    if (!signature && fuulApiKey) {
      logger.info("Signature verification skipped (stub mode)");
    }

    // Parse the event
    const body = await request.json();
    const { event, data } = body;

    if (!event || !data) {
      return NextResponse.json(
        { error: "Invalid event format" },
        { status: 400 }
      );
    }

    logger.info("Processing event", { event, data });

    // Map Fuul events to points
    let pointsToAward = 0;
    let description = "";

    switch (event) {
      case "referral.signup":
        pointsToAward = 100; // Configurable
        description = "Referral signup bonus";
        break;

      case "referral.trading":
        pointsToAward = 500; // Configurable
        description = "Referral first trade bonus";
        break;

      case "referral.volume":
        // Scale points based on volume
        const volume = data.volume || 0;
        pointsToAward = Math.floor(volume / 1000); // 1 point per $1000 volume
        description = `Referral volume milestone: $${volume}`;
        break;

      default:
        logger.info("Unknown event type, skipping", { event });
        return NextResponse.json({ success: true, message: "Event acknowledged" });
    }

    // Get referrer ID from Fuul data
    const { referrer_id, referred_user_id, fuul_referral_id } = data;

    if (!referrer_id) {
      return NextResponse.json(
        { error: "Missing referrer_id in event data" },
        { status: 400 }
      );
    }

    // Find user by Fuul ID or external ID
    // In production, you'd map Fuul's user ID to your internal user ID
    // For now, we'll use the referrer_id directly (assuming it matches)
    const referrerUserId = referrer_id;

    // Award points (idempotent - Fuul should not send duplicate events)
    const result = await awardReferralPoints(referrerUserId, pointsToAward, {
      referredUserId: referred_user_id,
      source: "fuul",
      fuulReferralId: fuul_referral_id,
    });

    if (!result.success) {
      logger.error("Failed to award points");
      return NextResponse.json(
        { error: "Failed to award points" },
        { status: 500 }
      );
    }

    logger.info("Points awarded successfully", {
      referrerUserId,
      points: pointsToAward,
      newTotal: result.newTotal,
    });

    return NextResponse.json({
      success: true,
      message: description,
      pointsAwarded: pointsToAward,
      newTotal: result.newTotal,
    });
  } catch (error) {
    logger.error("Webhook processing failed", error);
    
    // Don't expose internal errors to webhook sender
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/fuul/webhook
 * 
 * Health check endpoint for Fuul webhook verification.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "alpharena-fuul-webhook",
    timestamp: new Date().toISOString(),
  });
}
