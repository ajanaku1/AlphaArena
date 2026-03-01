import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import {
  initiateBinding,
  completeBinding,
} from "@/server/agent-wallet/agent-wallet-service";

/**
 * POST /api/agent-wallet/bind
 *
 * Two-step agent wallet binding:
 *
 * Step 1 (initiate): { action: "initiate" }
 *   → Returns the message the user must sign with their wallet
 *
 * Step 2 (confirm): { action: "confirm", signature: "<base58>" }
 *   → Completes the binding on Pacifica
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId: privyId } = authResult;

    const body = await request.json();
    const { action } = body;

    // Resolve the internal user ID and wallet address
    const user = await prisma.user.findUnique({
      where: { privyId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.walletAddress) {
      return NextResponse.json(
        { error: "No wallet address linked to this account" },
        { status: 400 }
      );
    }

    if (action === "initiate") {
      const result = await initiateBinding(user.id, user.walletAddress);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        agentPublicKey: result.agentPublicKey,
        messageToSign: result.messageToSign,
        messageBytes: result.messageBytes,
        timestamp: result.timestamp,
        expiryWindow: result.expiryWindow,
      });
    }

    if (action === "confirm") {
      const { signature, timestamp, expiryWindow } = body;

      if (!signature || typeof signature !== "string") {
        return NextResponse.json(
          { error: "signature is required" },
          { status: 400 }
        );
      }

      if (!timestamp || !expiryWindow) {
        return NextResponse.json(
          { error: "timestamp and expiryWindow are required" },
          { status: 400 }
        );
      }

      const result = await completeBinding(user.id, signature, timestamp, expiryWindow);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        agentPublicKey: result.agentPublicKey,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "initiate" or "confirm".' },
      { status: 400 }
    );
  } catch (error) {
    console.error("[AgentWallet Bind] Error:", error);
    return NextResponse.json(
      { error: "Failed to bind agent wallet", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
