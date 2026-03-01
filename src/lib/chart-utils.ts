/**
 * Chart Data Utilities
 *
 * Generates deterministic chart data for sparklines and equity curves.
 */

/**
 * Simple hash function for deterministic randomness
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Seeded pseudo-random number generator
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generate sparkline data for a trader card.
 * Produces a deterministic random walk that ends near the given PnL.
 */
export function generateSparklineData(
  finalPnl: number,
  seed: string,
  points: number = 7
): number[] {
  const rng = seededRandom(hashCode(seed));
  const data: number[] = [];

  // Generate a random walk
  let value = 0;
  for (let i = 0; i < points - 1; i++) {
    value += (rng() - 0.45) * Math.abs(finalPnl) * 0.3;
    data.push(value);
  }

  // Last point anchored to actual PnL
  data.push(finalPnl);

  // Normalize so the trend makes sense relative to final PnL
  const min = Math.min(...data);
  if (min < 0 && finalPnl > 0) {
    // Shift up to show growth trajectory
    const shift = Math.abs(min) * 0.5;
    return data.map((v) => v + shift);
  }

  return data;
}

/**
 * Generate portfolio equity curve data over the last 30 days.
 */
export function generateEquityData(
  totalValue: number,
  totalPnl: number
): { date: string; value: number }[] {
  const data: { date: string; value: number }[] = [];
  const days = 30;
  const startValue = totalValue - totalPnl;
  const dailyChange = totalPnl / days;
  const rng = seededRandom(hashCode(String(totalValue)));

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i));

    // Smooth growth with some noise
    const noise = (rng() - 0.5) * Math.abs(dailyChange) * 2;
    const value = startValue + dailyChange * i + noise;

    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.max(0, value),
    });
  }

  // Ensure last point matches current total value
  data.push({
    date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: totalValue,
  });

  return data;
}
