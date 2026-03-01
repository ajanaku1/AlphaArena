import { NextResponse } from "next/server";
import { syncAllTraders } from "@/server/sync/sync-traders";
import { syncCopyPositions } from "@/server/copy/sync-copy-positions";

/**
 * Sync endpoint - triggers trader sync and position update.
 * Can be called by Vercel cron or manually.
 */
export async function GET() {
  try {
    const [traderResult, positionResult] = await Promise.all([
      syncAllTraders(),
      syncCopyPositions(),
    ]);

    return NextResponse.json({
      success: true,
      traders: {
        synced: traderResult.tradersSynced,
        strategies: traderResult.strategiesSynced,
        errors: traderResult.errors.length,
      },
      positions: {
        updated: positionResult.positionsUpdated,
        closed: positionResult.positionsClosed,
        errors: positionResult.errors.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Sync failed" },
      { status: 500 }
    );
  }
}
