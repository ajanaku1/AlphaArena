import { NextRequest, NextResponse } from "next/server";
import { pacifica } from "@/lib/pacifica-client";

/**
 * GET /api/arena/check-account?address=<solana_address>
 *
 * Checks whether a wallet address has a Pacifica testnet account.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      { error: "address query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const accountInfo = await pacifica.getAccountInfo(address);

    if (!accountInfo) {
      return NextResponse.json({ hasPacificaAccount: false });
    }

    return NextResponse.json({
      hasPacificaAccount: true,
      accountInfo: {
        balance: accountInfo.balance,
        accountEquity: accountInfo.account_equity,
        positionsCount: accountInfo.positions_count,
        feeLevel: accountInfo.fee_level,
      },
    });
  } catch {
    // API errors / 404 → treat as "no account"
    return NextResponse.json({ hasPacificaAccount: false });
  }
}
