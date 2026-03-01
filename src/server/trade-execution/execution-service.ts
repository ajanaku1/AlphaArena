/**
 * Trade Execution Service
 *
 * Orchestrates real order execution on Pacifica:
 * - Loads the user's agent wallet
 * - Creates TradeExecution audit records
 * - Calls Pacifica trading API
 * - Updates CopyPosition records with execution results
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getAgentWallet } from "@/server/agent-wallet/agent-wallet-service";
import {
  createMarketOrder,
  batchOrders,
} from "@/lib/pacifica-trading-client";

// ============================================================================
// Types
// ============================================================================

export interface ExecutionResult {
  success: boolean;
  orderId?: number;
  error?: string;
  tradeExecutionId?: string;
}

export interface BatchExecutionResult {
  success: boolean;
  results: Array<{
    copyPositionId: string;
    success: boolean;
    orderId?: number;
    error?: string;
  }>;
  totalSucceeded: number;
  totalFailed: number;
}

// ============================================================================
// Helpers
// ============================================================================

function generateClientOrderId(prefix: string, positionId: string): string {
  const shortId = positionId.slice(0, 8);
  const uuid = randomUUID().slice(0, 8);
  return `${prefix}-${shortId}-${uuid}`;
}

/**
 * Convert LONG/SHORT to Pacifica bid/ask.
 * For opening: LONG = bid, SHORT = ask
 * For closing: reverse (LONG close = ask, SHORT close = bid)
 */
function sideToApi(side: string, isClose: boolean = false): "bid" | "ask" {
  const isLong = side.toUpperCase() === "LONG" || side === "bid";

  if (isClose) {
    return isLong ? "ask" : "bid";
  }
  return isLong ? "bid" : "ask";
}

/**
 * Format position size for Pacifica API (string with reasonable precision).
 */
function formatAmount(size: number): string {
  // Pacifica expects string amounts
  if (size >= 1) return size.toFixed(4);
  if (size >= 0.01) return size.toFixed(6);
  return size.toFixed(8);
}

// ============================================================================
// Execution Functions
// ============================================================================

/**
 * Execute a market order to open a copy position on Pacifica.
 */
export async function executeOpenOrder(params: {
  copyPositionId: string;
  userId: string;
  symbol: string;
  side: string; // "LONG" or "SHORT"
  size: number;
  slippagePercent?: string;
}): Promise<ExecutionResult> {
  const {
    copyPositionId,
    userId,
    symbol,
    side,
    size,
    slippagePercent,
  } = params;

  // Load agent wallet
  const agent = await getAgentWallet(userId);
  if (!agent) {
    return {
      success: false,
      error: "No active agent wallet. Bind your wallet first.",
    };
  }

  const clientOrderId = generateClientOrderId("alpha-open", copyPositionId);
  const apiSide = sideToApi(side, false);
  const amount = formatAmount(size);

  // Create audit record
  const tradeExecution = await prisma.tradeExecution.create({
    data: {
      copyPositionId,
      agentWalletId: agent.agentWalletId,
      symbol,
      side: apiSide,
      amount,
      orderType: "MARKET",
      reduceOnly: false,
      slippagePercent: slippagePercent || process.env.DEFAULT_SLIPPAGE_PERCENT || "1",
      clientOrderId,
      status: "PENDING",
    },
  });

  // Execute on Pacifica
  const result = await createMarketOrder({
    keypair: agent.keypair,
    account: agent.userWalletAddress,
    agentWallet: agent.publicKey,
    symbol,
    side: apiSide,
    amount,
    reduceOnly: false,
    slippagePercent: slippagePercent || process.env.DEFAULT_SLIPPAGE_PERCENT || "1",
    clientOrderId,
  });

  if (result.success) {
    // Update trade execution
    await prisma.tradeExecution.update({
      where: { id: tradeExecution.id },
      data: {
        status: "FILLED",
        pacificaOrderId: result.orderId?.toString(),
        rawResponse: JSON.stringify(result.rawResponse),
        filledAt: new Date(),
      },
    });

    // Update copy position
    await prisma.copyPosition.update({
      where: { id: copyPositionId },
      data: {
        executionMode: "LIVE",
        pacificaOrderId: result.orderId?.toString(),
      },
    });

    console.log(
      `[Execution] Opened: ${apiSide} ${amount} ${symbol} (order ${result.orderId})`
    );

    return {
      success: true,
      orderId: result.orderId,
      tradeExecutionId: tradeExecution.id,
    };
  } else {
    // Update trade execution as failed
    await prisma.tradeExecution.update({
      where: { id: tradeExecution.id },
      data: {
        status: "FAILED",
        errorMessage: result.error,
        errorCode: result.errorCode,
        rawResponse: JSON.stringify(result.rawResponse),
      },
    });

    console.error(
      `[Execution] Open failed: ${result.error} (${symbol} ${apiSide} ${amount}). Position remains OPEN.`
    );

    return {
      success: false,
      error: result.error,
      tradeExecutionId: tradeExecution.id,
    };
  }
}

/**
 * Execute a market order to close a copy position on Pacifica.
 * Uses reduceOnly=true and opposite side.
 */
export async function executeCloseOrder(params: {
  copyPositionId: string;
  userId: string;
  symbol: string;
  side: string; // "LONG" or "SHORT" (the position's side, not the close side)
  size: number;
  slippagePercent?: string;
}): Promise<ExecutionResult> {
  const {
    copyPositionId,
    userId,
    symbol,
    side,
    size,
    slippagePercent,
  } = params;

  const agent = await getAgentWallet(userId);
  if (!agent) {
    return {
      success: false,
      error: "No active agent wallet.",
    };
  }

  const clientOrderId = generateClientOrderId("alpha-close", copyPositionId);
  const closeSide = sideToApi(side, true); // Opposite side to close
  const amount = formatAmount(size);
  const slippage = slippagePercent || process.env.AUTO_CLOSE_SLIPPAGE_PERCENT || "3";

  // Create audit record
  const tradeExecution = await prisma.tradeExecution.create({
    data: {
      copyPositionId,
      agentWalletId: agent.agentWalletId,
      symbol,
      side: closeSide,
      amount,
      orderType: "MARKET",
      reduceOnly: true,
      slippagePercent: slippage,
      clientOrderId,
      status: "PENDING",
    },
  });

  const result = await createMarketOrder({
    keypair: agent.keypair,
    account: agent.userWalletAddress,
    agentWallet: agent.publicKey,
    symbol,
    side: closeSide,
    amount,
    reduceOnly: true,
    slippagePercent: slippage,
    clientOrderId,
  });

  if (result.success) {
    await prisma.tradeExecution.update({
      where: { id: tradeExecution.id },
      data: {
        status: "FILLED",
        pacificaOrderId: result.orderId?.toString(),
        rawResponse: JSON.stringify(result.rawResponse),
        filledAt: new Date(),
      },
    });

    await prisma.copyPosition.update({
      where: { id: copyPositionId },
      data: { closeOrderId: result.orderId?.toString() },
    });

    console.log(
      `[Execution] Closed: ${closeSide} ${amount} ${symbol} (order ${result.orderId})`
    );

    return {
      success: true,
      orderId: result.orderId,
      tradeExecutionId: tradeExecution.id,
    };
  } else {
    await prisma.tradeExecution.update({
      where: { id: tradeExecution.id },
      data: {
        status: "FAILED",
        errorMessage: result.error,
        errorCode: result.errorCode,
        rawResponse: JSON.stringify(result.rawResponse),
      },
    });

    console.error(
      `[Execution] Close failed: ${result.error} (${symbol} ${closeSide} ${amount})`
    );

    return {
      success: false,
      error: result.error,
      tradeExecutionId: tradeExecution.id,
    };
  }
}

/**
 * Execute batch open orders for multiple copy positions.
 * Uses Pacifica's batch API (up to 10 orders).
 */
export async function executeBatchOpen(params: {
  userId: string;
  orders: Array<{
    copyPositionId: string;
    symbol: string;
    side: string;
    size: number;
  }>;
}): Promise<BatchExecutionResult> {
  const { userId, orders } = params;

  if (orders.length === 0) {
    return { success: true, results: [], totalSucceeded: 0, totalFailed: 0 };
  }

  // For a single order, use the direct method
  if (orders.length === 1) {
    const order = orders[0];
    const result = await executeOpenOrder({
      copyPositionId: order.copyPositionId,
      userId,
      symbol: order.symbol,
      side: order.side,
      size: order.size,
    });
    return {
      success: result.success,
      results: [
        {
          copyPositionId: order.copyPositionId,
          success: result.success,
          orderId: result.orderId,
          error: result.error,
        },
      ],
      totalSucceeded: result.success ? 1 : 0,
      totalFailed: result.success ? 0 : 1,
    };
  }

  // For multiple orders, use batch API
  const agent = await getAgentWallet(userId);
  if (!agent) {
    return {
      success: false,
      results: orders.map((o) => ({
        copyPositionId: o.copyPositionId,
        success: false,
        error: "No active agent wallet.",
      })),
      totalSucceeded: 0,
      totalFailed: orders.length,
    };
  }

  // Prepare batch orders
  const batchOrderParams = orders.map((order) => {
    const clientOrderId = generateClientOrderId("alpha-open", order.copyPositionId);
    return {
      symbol: order.symbol,
      side: sideToApi(order.side, false),
      amount: formatAmount(order.size),
      reduceOnly: false,
      clientOrderId,
      _copyPositionId: order.copyPositionId, // Internal tracking
    };
  });

  // Create audit records
  for (const order of batchOrderParams) {
    await prisma.tradeExecution.create({
      data: {
        copyPositionId: order._copyPositionId,
        agentWalletId: agent.agentWalletId,
        symbol: order.symbol,
        side: order.side,
        amount: order.amount,
        orderType: "MARKET",
        reduceOnly: false,
        slippagePercent: process.env.DEFAULT_SLIPPAGE_PERCENT || "1",
        clientOrderId: order.clientOrderId!,
        status: "PENDING",
      },
    });
  }

  // Submit batch
  const batchResult = await batchOrders({
    keypair: agent.keypair,
    account: agent.userWalletAddress,
    agentWallet: agent.publicKey,
    orders: batchOrderParams.map((o) => ({
      symbol: o.symbol,
      side: o.side as "bid" | "ask",
      amount: o.amount,
      reduceOnly: o.reduceOnly,
      clientOrderId: o.clientOrderId,
    })),
  });

  // Process results
  const results: BatchExecutionResult["results"] = [];
  let totalSucceeded = 0;
  let totalFailed = 0;

  for (let i = 0; i < batchOrderParams.length; i++) {
    const order = batchOrderParams[i];
    const orderResult = batchResult.results[i];
    const succeeded = orderResult?.success ?? false;

    if (succeeded) {
      totalSucceeded++;
      await prisma.tradeExecution.update({
        where: { clientOrderId: order.clientOrderId! },
        data: {
          status: "FILLED",
          pacificaOrderId: orderResult?.orderId?.toString(),
          filledAt: new Date(),
        },
      });
      await prisma.copyPosition.update({
        where: { id: order._copyPositionId },
        data: {
          executionMode: "LIVE",
          pacificaOrderId: orderResult?.orderId?.toString(),
        },
      });
    } else {
      totalFailed++;
      await prisma.tradeExecution.update({
        where: { clientOrderId: order.clientOrderId! },
        data: {
          status: "FAILED",
          errorMessage: orderResult?.error || "Unknown batch error",
        },
      });
      // Position remains OPEN - Pacifica execution is best-effort
    }

    results.push({
      copyPositionId: order._copyPositionId,
      success: succeeded,
      orderId: orderResult?.orderId,
      error: orderResult?.error ?? undefined,
    });
  }

  return {
    success: totalFailed === 0,
    results,
    totalSucceeded,
    totalFailed,
  };
}
