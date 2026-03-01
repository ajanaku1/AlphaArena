import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import { revokeAgentWalletForUser } from "@/server/agent-wallet/agent-wallet-service";

/**
 * POST /api/agent-wallet/revoke
 *
 * Revokes the user's agent wallet, disabling live trading.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId: privyId } = authResult;

    const user = await prisma.user.findUnique({
      where: { privyId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const result = await revokeAgentWalletForUser(user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AgentWallet Revoke] Error:", error);
    return NextResponse.json(
      { error: "Failed to revoke agent wallet" },
      { status: 500 }
    );
  }
}
