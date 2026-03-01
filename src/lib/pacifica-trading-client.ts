/**
 * Pacifica Trading Client
 *
 * Handles all POST (write) operations against the Pacifica API:
 * - Market orders
 * - Limit orders
 * - Batch orders
 * - Agent wallet binding/revocation
 *
 * Uses the signing module from pacifica-signer.ts for ed25519 message signing.
 */

import { Keypair } from "@solana/web3.js";
import { buildSignedRequest } from "./pacifica-signer";

// ============================================================================
// Configuration
// ============================================================================

function getTradingBaseUrl(): string {
  const env = process.env.PACIFICA_TRADING_ENV || "testnet";
  if (env === "mainnet") {
    return "https://api.pacifica.fi/api/v1";
  }
  return "https://test-api.pacifica.fi/api/v1";
}

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
};

// ============================================================================
// Types
// ============================================================================

export interface MarketOrderParams {
  keypair: Keypair; // Agent wallet keypair (for signing)
  account: string; // User's wallet address
  agentWallet: string; // Agent wallet public key
  symbol: string;
  side: "bid" | "ask";
  amount: string;
  reduceOnly?: boolean;
  slippagePercent?: string;
  clientOrderId?: string;
}

export interface LimitOrderParams {
  keypair: Keypair;
  account: string;
  agentWallet: string;
  symbol: string;
  side: "bid" | "ask";
  price: string;
  amount: string;
  tif?: "GTC" | "IOC" | "ALO" | "TOB";
  reduceOnly?: boolean;
  clientOrderId?: string;
}

export interface BatchOrderAction {
  type: "Create" | "Cancel";
  data: Record<string, unknown>;
}

export interface MarketOrderResponse {
  success: boolean;
  orderId?: number;
  error?: string;
  errorCode?: string;
  rawResponse?: Record<string, unknown>;
}

export interface BatchOrderResponse {
  success: boolean;
  results: Array<{
    success: boolean;
    orderId?: number;
    error?: string | null;
  }>;
  rawResponse?: Record<string, unknown>;
}

export interface BindAgentWalletParams {
  account: string;
  agentPublicKey: string;
  signature: string; // User's signature (from wallet signMessage)
  timestamp: number;
  expiryWindow: number;
}

export interface BindAgentWalletResponse {
  success: boolean;
  error?: string;
  rawResponse?: Record<string, unknown>;
}

// ============================================================================
// Error Classes
// ============================================================================

export class PacificaTradingError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly rawResponse?: Record<string, unknown>
  ) {
    super(`Pacifica Trading Error ${status}: ${message}`);
    this.name = "PacificaTradingError";
  }
}

// ============================================================================
// Utility
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoff(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * delay;
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelay);
}

// ============================================================================
// Core Request Function
// ============================================================================

async function tradingRequest<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${getTradingBaseUrl()}${endpoint}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Handle non-JSON responses (Pacifica sometimes returns plain text errors)
      const contentType = response.headers.get("content-type") || "";
      let data: Record<string, unknown>;
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        if (!response.ok) {
          throw new PacificaTradingError(
            response.status,
            text || response.statusText,
            undefined,
            { rawText: text }
          );
        }
        // Try parsing as JSON anyway
        try {
          data = JSON.parse(text);
        } catch {
          data = { rawText: text };
        }
      }

      if (response.status === 429) {
        if (attempt < RETRY_CONFIG.maxRetries) {
          const waitTime = calculateBackoff(attempt);
          console.warn(
            `[PacificaTrading] Rate limited. Waiting ${waitTime}ms...`
          );
          await sleep(waitTime);
          continue;
        }
      }

      if (!response.ok) {
        const errMsg = typeof data?.error === "string"
          ? data.error
          : (data?.rawText as string) || response.statusText;
        throw new PacificaTradingError(
          response.status,
          errMsg,
          data?.code as string | undefined,
          data
        );
      }

      return data as T;
    } catch (error) {
      lastError = error as Error;

      // Don't retry client errors (4xx) except rate limits
      if (
        error instanceof PacificaTradingError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) {
        break;
      }

      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = calculateBackoff(attempt);
        console.warn(
          `[PacificaTrading] Request failed (attempt ${attempt + 1}). Retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error("Pacifica trading request failed after retries");
}

// ============================================================================
// Trading API Methods
// ============================================================================

/**
 * Create a market order on Pacifica.
 *
 * Used for both opening positions and closing (with reduceOnly=true).
 */
export async function createMarketOrder(
  params: MarketOrderParams
): Promise<MarketOrderResponse> {
  const {
    keypair,
    account,
    agentWallet,
    symbol,
    side,
    amount,
    reduceOnly = false,
    slippagePercent = process.env.DEFAULT_SLIPPAGE_PERCENT || "1",
    clientOrderId,
  } = params;

  const payload: Record<string, unknown> = {
    symbol,
    side,
    amount,
    reduce_only: reduceOnly,
    slippage_percent: slippagePercent,
    ...(clientOrderId && { client_order_id: clientOrderId }),
  };

  const { body } = buildSignedRequest(
    keypair,
    account,
    "create_market_order",
    payload,
    agentWallet
  );

  console.log(
    `[PacificaTrading] Market order: ${side} ${amount} ${symbol} (reduceOnly=${reduceOnly})`
  );

  try {
    const response = await tradingRequest<Record<string, unknown>>(
      "/orders/create_market",
      body
    );

    return {
      success: true,
      orderId: response.order_id as number | undefined,
      rawResponse: response,
    };
  } catch (error) {
    const err = error as PacificaTradingError;
    return {
      success: false,
      error: err.message,
      errorCode: err.code,
      rawResponse: err.rawResponse,
    };
  }
}

/**
 * Create a limit order on Pacifica.
 */
export async function createLimitOrder(
  params: LimitOrderParams
): Promise<MarketOrderResponse> {
  const {
    keypair,
    account,
    agentWallet,
    symbol,
    side,
    price,
    amount,
    tif = "GTC",
    reduceOnly = false,
    clientOrderId,
  } = params;

  const payload: Record<string, unknown> = {
    symbol,
    side,
    price,
    amount,
    tif,
    reduce_only: reduceOnly,
    ...(clientOrderId && { client_order_id: clientOrderId }),
  };

  const { body } = buildSignedRequest(
    keypair,
    account,
    "create_order",
    payload,
    agentWallet
  );

  try {
    const response = await tradingRequest<Record<string, unknown>>(
      "/orders/create",
      body
    );

    return {
      success: true,
      orderId: response.order_id as number | undefined,
      rawResponse: response,
    };
  } catch (error) {
    const err = error as PacificaTradingError;
    return {
      success: false,
      error: err.message,
      errorCode: err.code,
      rawResponse: err.rawResponse,
    };
  }
}

/**
 * Submit a batch of orders (up to 10).
 * Each action is individually signed.
 */
export async function batchOrders(params: {
  keypair: Keypair;
  account: string;
  agentWallet: string;
  orders: Array<{
    symbol: string;
    side: "bid" | "ask";
    amount: string;
    reduceOnly?: boolean;
    slippagePercent?: string;
    clientOrderId?: string;
  }>;
}): Promise<BatchOrderResponse> {
  const { keypair, account, agentWallet, orders } = params;

  if (orders.length > 10) {
    return {
      success: false,
      results: [],
      rawResponse: { error: "Maximum 10 actions per batch" },
    };
  }

  const actions: BatchOrderAction[] = orders.map((order) => {
    const payload: Record<string, unknown> = {
      symbol: order.symbol,
      side: order.side,
      amount: order.amount,
      reduce_only: order.reduceOnly ?? false,
      slippage_percent: order.slippagePercent || process.env.DEFAULT_SLIPPAGE_PERCENT || "1",
      ...(order.clientOrderId && { client_order_id: order.clientOrderId }),
    };

    const { body } = buildSignedRequest(
      keypair,
      account,
      "create_market_order",
      payload,
      agentWallet
    );

    return {
      type: "Create" as const,
      data: body,
    };
  });

  console.log(
    `[PacificaTrading] Batch order: ${actions.length} orders`
  );

  try {
    const response = await tradingRequest<{
      success: boolean;
      data?: { results: Array<{ success: boolean; order_id?: number; error?: string | null }> };
    }>("/orders/batch", { actions });

    const results = (response.data?.results || []).map((r) => ({
      success: r.success,
      orderId: r.order_id,
      error: r.error,
    }));

    return {
      success: results.every((r) => r.success),
      results,
      rawResponse: response as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const err = error as PacificaTradingError;
    return {
      success: false,
      results: [],
      rawResponse: err.rawResponse,
    };
  }
}

// ============================================================================
// Agent Wallet API Methods
// ============================================================================

/**
 * Bind an agent wallet to a user's Pacifica account.
 *
 * This uses the user's signature (from their Solana wallet's signMessage)
 * to authorize the agent wallet.
 */
export async function bindAgentWallet(
  params: BindAgentWalletParams
): Promise<BindAgentWalletResponse> {
  const { account, agentPublicKey, signature, timestamp, expiryWindow } =
    params;

  const body = {
    account,
    agent_wallet: agentPublicKey,
    signature,
    timestamp,
    expiry_window: expiryWindow,
  };

  console.log(
    `[PacificaTrading] Binding agent wallet ${agentPublicKey.slice(0, 8)}... to account ${account.slice(0, 8)}...`
  );

  try {
    const response = await tradingRequest<Record<string, unknown>>(
      "/agent/bind",
      body
    );

    return {
      success: true,
      rawResponse: response,
    };
  } catch (error) {
    const err = error as PacificaTradingError;
    return {
      success: false,
      error: err.message,
      rawResponse: err.rawResponse,
    };
  }
}

/**
 * Revoke an agent wallet from a user's Pacifica account.
 */
export async function revokeAgentWallet(params: {
  keypair: Keypair;
  account: string;
  agentPublicKey: string;
}): Promise<{ success: boolean; error?: string }> {
  const { keypair, account, agentPublicKey } = params;

  const payload = { agent_wallet: agentPublicKey };
  const { body } = buildSignedRequest(
    keypair,
    account,
    "revoke_agent_wallet",
    payload
  );

  try {
    await tradingRequest("/agent/revoke", body);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Namespace Export
// ============================================================================

export const pacificaTrading = {
  createMarketOrder,
  createLimitOrder,
  batchOrders,
  bindAgentWallet,
  revokeAgentWallet,
};

export default pacificaTrading;
