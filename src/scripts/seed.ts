/**
 * Database Seed Script
 *
 * Seeds the database with REAL trader data from Pacifica's leaderboard API.
 *
 * 1. Fetches top traders from Pacifica leaderboard
 * 2. Syncs their account info, positions, and trade history
 * 3. Creates a demo user + active competition + sample copy positions
 *
 * Usage: npx tsx src/scripts/seed.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PACIFICA_API = process.env.PACIFICA_API_BASE || "https://api.pacifica.fi";

// ============================================================================
// Pacifica API helpers (standalone, no path alias deps)
// ============================================================================

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "*/*", "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText} — ${url}`);
  return res.json() as Promise<T>;
}

interface LeaderboardEntry {
  address: string;
  username: string | null;
  pnl_all_time: string;
  pnl_30d: string;
  pnl_7d: string;
  equity_current: string;
  oi_current: string;
  volume_all_time: string;
}

interface AccountInfo {
  balance: string;
  fee_level: number;
  account_equity: string;
  positions_count: number;
}

interface Position {
  symbol: string;
  side: "bid" | "ask";
  amount: string;
  entry_price: string;
  margin?: string;
  funding: string;
  isolated: boolean;
  created_at: number;
  updated_at: number;
}

interface Trade {
  pnl: string;
  side: string;
  symbol: string;
  amount: string;
  price: string;
  created_at: number;
}

// ============================================================================
// Seed functions
// ============================================================================

async function seedTradersFromPacifica() {
  console.log("Fetching Pacifica leaderboard...\n");

  const { data: leaderboard } = await fetchJson<{ data: LeaderboardEntry[] }>(
    `${PACIFICA_API}/api/v1/leaderboard?limit=100`
  );

  // Filter to traders with active equity AND open interest (actually trading)
  const activeTraders = leaderboard.filter((t) => {
    const equity = parseFloat(t.equity_current) || 0;
    const oi = parseFloat(t.oi_current) || 0;
    return equity > 100 && oi > 0;
  });

  // Take top 15 active traders
  const selected = activeTraders.slice(0, 15);
  console.log(`Found ${leaderboard.length} traders, ${activeTraders.length} active, seeding top ${selected.length}\n`);

  let synced = 0;

  for (const entry of selected) {
    const addr = entry.address;
    const tag = entry.username || `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    try {
      // Fetch account info
      const { data: account } = await fetchJson<{ data: AccountInfo }>(
        `${PACIFICA_API}/api/v1/account?account=${addr}`
      );

      // Fetch positions
      const { data: positions } = await fetchJson<{ data: Position[] }>(
        `${PACIFICA_API}/api/v1/positions?account=${addr}`
      );

      // Fetch trade history (last 100 trades)
      const { data: trades } = await fetchJson<{ data: Trade[] }>(
        `${PACIFICA_API}/api/v1/trades/history?account=${addr}&limit=100`
      );

      // Calculate win rate from closing trades
      const closingTrades = trades.filter(
        (t) => t.side === "close_long" || t.side === "close_short"
      );
      const wins = closingTrades.filter((t) => parseFloat(t.pnl) > 0).length;
      const winRate = closingTrades.length > 0 ? (wins / closingTrades.length) * 100 : 50;

      // Calculate basic risk metrics from trade PnLs
      const pnls = closingTrades.map((t) => parseFloat(t.pnl));
      const grossProfit = pnls.filter((p) => p > 0).reduce((s, p) => s + p, 0);
      const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((s, p) => s + p, 0));
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10 : 0;

      // Max drawdown from cumulative PnL curve
      let peak = 0;
      let maxDrawdown = 0;
      let cumulative = 0;
      for (const pnl of pnls) {
        cumulative += pnl;
        if (cumulative > peak) peak = cumulative;
        const dd = peak > 0 ? ((peak - cumulative) / peak) * 100 : 0;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

      // Sharpe ratio (annualized, assuming ~1 trade per day)
      const mean = pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
      const variance = pnls.length > 1
        ? pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / (pnls.length - 1)
        : 0;
      const stdDev = Math.sqrt(variance);
      const sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;

      const allTimePnl = parseFloat(entry.pnl_all_time) || 0;
      const equity = parseFloat(account.account_equity) || 0;

      // Display name: use username, or generate one
      const displayName = entry.username || `Trader ${addr.slice(0, 6)}...${addr.slice(-4)}`;

      // Upsert trader
      const trader = await prisma.trader.upsert({
        where: { pacificaTraderId: addr },
        update: {
          displayName,
          totalPnl: allTimePnl,
          winRate,
          accountEquity: equity,
          positionsCount: positions.length,
          feeLevel: account.fee_level,
          maxDrawdown,
          sharpeRatio,
          volatility: stdDev,
          profitFactor,
          lastSyncedAt: new Date(),
        },
        create: {
          pacificaTraderId: addr,
          displayName,
          totalPnl: allTimePnl,
          winRate,
          accountEquity: equity,
          positionsCount: positions.length,
          feeLevel: account.fee_level,
          totalFollowers: 0,
          totalCopiers: 0,
          maxDrawdown,
          sharpeRatio,
          volatility: stdDev,
          profitFactor,
          lastSyncedAt: new Date(),
          firstSeenAt: new Date(),
        },
      });

      // Sync positions as strategies
      for (const pos of positions) {
        await prisma.strategy.upsert({
          where: {
            id: `${trader.id}-${pos.symbol}-${pos.side}`, // won't match, will create
          },
          update: {},
          create: {
            traderId: trader.id,
            symbol: pos.symbol,
            side: pos.side,
            size: parseFloat(pos.amount) || 0,
            entryPrice: parseFloat(pos.entry_price) || 0,
            pnl: 0,
            margin: pos.margin ? parseFloat(pos.margin) : null,
            funding: parseFloat(pos.funding) || 0,
            isolated: pos.isolated,
            openedAt: new Date(pos.created_at),
            rawData: JSON.stringify(pos),
          },
        });
      }

      const pnlStr = allTimePnl >= 0 ? `+$${allTimePnl.toFixed(0)}` : `-$${Math.abs(allTimePnl).toFixed(0)}`;
      console.log(`  ${tag.padEnd(45)} ${pnlStr.padStart(12)}   ${positions.length} positions   WR: ${winRate.toFixed(0)}%`);
      synced++;

      // Rate limit: 500ms between traders
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`  SKIP ${tag}: ${msg}`);
    }
  }

  console.log(`\n  Synced ${synced} traders from Pacifica\n`);
}

async function seedDemoUser() {
  console.log("Creating demo user...");

  const user = await prisma.user.upsert({
    where: { privyId: "demo-user" },
    update: {},
    create: {
      privyId: "demo-user",
      displayName: "Demo Trader",
      username: "demo_trader",
      email: "demo@alpharena.com",
      referralCode: "ALPHA-DEMO",
      referralPoints: 250,
      totalPnl: 0,
      totalAllocated: 0,
    },
  });

  console.log(`  Demo user: ${user.id}\n`);
  return user;
}

async function seedCompetition() {
  console.log("Creating active competition...");

  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const startOfWeek = new Date(now);
  startOfWeek.setUTCDate(now.getUTCDate() - ((dayOfWeek + 6) % 7));
  startOfWeek.setUTCHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
  endOfWeek.setUTCHours(23, 59, 59, 999);

  const weekNum = Math.ceil(
    (now.getTime() - new Date(now.getUTCFullYear(), 0, 1).getTime()) / (7 * 86400000)
  );

  const competition = await prisma.competition.create({
    data: {
      name: `Trading Royale - Week ${weekNum}`,
      description: "Weekly copy-trading competition. Copy the best traders, climb the leaderboard!",
      startAt: startOfWeek,
      endAt: endOfWeek,
      status: "ACTIVE",
      prizePool: 1750,
      firstPlacePrize: 1000,
      secondPlacePrize: 500,
      thirdPlacePrize: 250,
      totalParticipants: 0,
    },
  });

  console.log(`  Competition: ${competition.name}\n`);
  return competition;
}

async function seedCopyPositions(userId: string) {
  console.log("Creating demo copy positions from real trader data...");

  // Get 3 traders that actually have open positions
  const traders = await prisma.trader.findMany({
    where: { positionsCount: { gt: 0 } },
    take: 3,
    orderBy: { totalPnl: "desc" },
    include: { strategies: { where: { closedAt: null }, take: 2 } },
  });

  let count = 0;
  for (const trader of traders) {
    for (const strategy of trader.strategies) {
      const allocationUsd = 500 + Math.random() * 2000;
      const priceChange = (Math.random() - 0.4) * 0.05;
      const currentPrice = strategy.entryPrice * (1 + priceChange);
      const side = strategy.side === "bid" ? "LONG" : "SHORT";
      const size = trader.accountEquity > 0
        ? (allocationUsd / trader.accountEquity) * strategy.size
        : strategy.size * 0.01;

      const pnl = side === "LONG"
        ? size * (currentPrice - strategy.entryPrice)
        : size * (strategy.entryPrice - currentPrice);

      await prisma.copyPosition.create({
        data: {
          userId,
          traderId: trader.id,
          strategyId: strategy.id,
          symbol: strategy.symbol,
          side,
          size,
          entryPrice: strategy.entryPrice,
          currentPrice,
          pnl,
          pnlPercent: allocationUsd > 0 ? (pnl / allocationUsd) * 100 : 0,
          allocationUsd,
          status: "OPEN",
          leverage: 1 + Math.floor(Math.random() * 5),
          openedAt: new Date(Date.now() - Math.random() * 5 * 86400000),
        },
      });
      count++;
    }
  }

  // Update user totals
  const positions = await prisma.copyPosition.findMany({
    where: { userId, status: "OPEN" },
  });
  const totalAllocated = positions.reduce((s, p) => s + p.allocationUsd, 0);
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);

  await prisma.user.update({
    where: { id: userId },
    data: { totalAllocated, totalPnl },
  });

  console.log(`  Created ${count} copy positions from real trader data\n`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("\n========================================");
  console.log("  AlphaArena Seed — Real Pacifica Data");
  console.log("========================================\n");

  // Clear existing data
  console.log("Clearing existing data...");
  await prisma.copyPosition.deleteMany();
  await prisma.strategy.deleteMany();
  await prisma.leaderboardEntry.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.competition.deleteMany();
  await prisma.trader.deleteMany();
  await prisma.user.deleteMany();
  console.log("  Done\n");

  await seedTradersFromPacifica();
  const user = await seedDemoUser();
  await seedCompetition();
  await seedCopyPositions(user.id);

  console.log("========================================");
  console.log("  Seed completed with real Pacifica data!");
  console.log("========================================\n");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
