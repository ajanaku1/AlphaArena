/**
 * Risk Analytics Engine
 *
 * Calculates advanced risk metrics from trade history:
 * - Max Drawdown
 * - Sharpe Ratio
 * - Volatility
 * - Profit Factor
 */

import type { PacificaTrade } from "@/lib/pacifica-client";

export interface RiskMetrics {
  maxDrawdown: number;
  sharpeRatio: number;
  volatility: number;
  profitFactor: number;
}

/**
 * Calculate risk metrics from a trader's trade history
 */
export function calculateRiskMetrics(trades: PacificaTrade[]): RiskMetrics {
  // Only analyze closing trades
  const closingTrades = trades.filter(
    (t) => t.side === "close_long" || t.side === "close_short"
  );

  if (closingTrades.length < 2) {
    return { maxDrawdown: 0, sharpeRatio: 0, volatility: 0, profitFactor: 0 };
  }

  const pnls = closingTrades.map((t) => parseFloat(t.pnl) || 0);

  return {
    maxDrawdown: calcMaxDrawdown(pnls),
    sharpeRatio: calcSharpeRatio(pnls),
    volatility: calcVolatility(pnls),
    profitFactor: calcProfitFactor(pnls),
  };
}

/**
 * Maximum drawdown: largest peak-to-trough decline in cumulative PnL
 */
function calcMaxDrawdown(pnls: number[]): number {
  let peak = 0;
  let maxDD = 0;
  let cumulative = 0;

  for (const pnl of pnls) {
    cumulative += pnl;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDD) maxDD = drawdown;
  }

  // Express as percentage of peak (or 0 if no peak)
  return peak > 0 ? (maxDD / peak) * 100 : 0;
}

/**
 * Sharpe Ratio: (mean return - risk-free rate) / std deviation
 * Uses 0 as risk-free rate for simplicity
 */
function calcSharpeRatio(pnls: number[]): number {
  if (pnls.length < 2) return 0;

  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((sum, p) => sum + (p - mean) ** 2, 0) / (pnls.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // Annualize assuming ~252 trading days
  return (mean / stdDev) * Math.sqrt(252);
}

/**
 * Volatility: annualized standard deviation of returns
 */
function calcVolatility(pnls: number[]): number {
  if (pnls.length < 2) return 0;

  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((sum, p) => sum + (p - mean) ** 2, 0) / (pnls.length - 1);

  // Annualize
  return Math.sqrt(variance * 252);
}

/**
 * Profit Factor: gross profits / gross losses
 * > 1 means profitable overall
 */
function calcProfitFactor(pnls: number[]): number {
  const grossProfit = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0));

  if (grossLoss === 0) return grossProfit > 0 ? 99 : 0;
  return grossProfit / grossLoss;
}
