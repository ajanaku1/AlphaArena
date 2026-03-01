import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import { getAgentWalletStatus } from "@/server/agent-wallet/agent-wallet-service";

/**
 * GET /api/agent-wallet/status
 *
 * Returns the current agent wallet status for the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const { userId: privyId } = authResult;

    const user = await prisma.user.findUnique({
      where: { privyId },
    });

    if (!user) {
      return NextResponse.json({ hasAgentWallet: false });
    }

    const status = await getAgentWalletStatus(user.id);

    return NextResponse.json(status);
  } catch (error) {
    console.error("[AgentWallet Status] Error:", error);
    return NextResponse.json({ hasAgentWallet: false });
  }
}
