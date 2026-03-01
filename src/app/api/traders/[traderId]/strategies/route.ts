import { NextResponse } from "next/server";
import { getTraderByPacificaId, getTraderPositions } from "@/server/trader";

export async function GET(
  request: Request,
  { params }: { params: { traderId: string } }
) {
  try {
    const { traderId } = params;
    
    // Get trader positions (strategies)
    const positions = await getTraderPositions(traderId);

    return NextResponse.json({ 
      strategies: positions.map((s) => ({
        id: s.id,
        symbol: s.symbol,
        side: s.side,
        size: s.size,
        entryPrice: s.entryPrice,
        pnl: s.pnl,
        margin: s.margin,
        funding: s.funding,
        isolated: s.isolated,
        openedAt: s.openedAt.toISOString(),
        closedAt: s.closedAt?.toISOString(),
      }))
    });
  } catch (error) {
    console.error("Error fetching strategies:", error);
    return NextResponse.json(
      { error: "Failed to fetch strategies" },
      { status: 500 }
    );
  }
}
