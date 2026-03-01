/**
 * Pacifica API Client
 * 
 * Robust client for Pacifica perpetual DEX API with:
 * - Typed responses
 * - Error handling
 * - Retry with exponential backoff
 * - Rate limit awareness
 * 
 * Docs: https://docs.pacifica.fi/api-documentation/api
 */

const BASE_URL = process.env.PACIFICA_API_BASE || "https://test-api.pacifica.fi";
const API_KEY = process.env.PACIFICA_API_KEY;

// Rate limit configuration
const RATE_LIMIT = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  creditRefreshWindow: 60, // seconds
};

// ============================================================================
// Types
// ============================================================================

export interface PacificaPosition {
  symbol: string;
  side: "bid" | "ask"; // bid = long, ask = short
  amount: string;
  entry_price: string;
  margin?: string;
  funding: string;
  isolated: boolean;
  created_at: number;
  updated_at: number;
}

export interface PacificaAccountInfo {
  balance: string;
  fee_level: number;
  maker_fee: string;
  taker_fee: string;
  account_equity: string;
  available_to_spend: string;
  available_to_withdraw: string;
  pending_balance: string;
  total_margin_used: string;
  cross_mmr: string;
  positions_count: number;
  orders_count: number;
  stop_orders_count: number;
  updated_at: number;
  use_ltp_for_stop_orders: boolean;
}

export interface PacificaTrade {
  history_id: number;
  order_id: number;
  client_order_id: string;
  symbol: string;
  amount: string;
  price: string;
  entry_price: string;
  fee: string;
  pnl: string;
  event_type: "fulfill_taker" | "fulfill_maker";
  side: "open_long" | "open_short" | "close_long" | "close_short";
  created_at: number;
  cause: "normal" | "market_liquidation" | "backstop_liquidation" | "settlement";
}

export interface PacificaTradeHistoryResponse {
  success: boolean;
  data: PacificaTrade[];
  next_cursor?: string;
  has_more: boolean;
}

export interface PacificaMarketInfo {
  symbol: string;
  tick_size: string;
  min_tick: string;
  max_tick: string;
  lot_size: string;
  max_leverage: number;
  isolated_only: boolean;
  min_order_size: string;
  max_order_size: string;
  funding_rate: string;
  next_funding_rate: string;
  created_at: number;
}

export interface PacificaPositionsResponse {
  success: boolean;
  data: PacificaPosition[];
  error?: { message: string } | null;
  code?: string | null;
  last_order_id: number;
}

export interface PacificaAccountResponse {
  success: boolean;
  data: PacificaAccountInfo;
  error?: { message: string } | null;
  code?: string | null;
}

export interface PacificaMarketInfoResponse {
  success: boolean;
  data: PacificaMarketInfo[];
  error?: { message: string } | null;
  code?: string | null;
}

export interface PacificaLeaderboardEntry {
  address: string;
  username: string | null;
  pnl_1d: string;
  pnl_7d: string;
  pnl_30d: string;
  pnl_all_time: string;
  equity_current: string;
  oi_current: string;
  volume_1d: string;
  volume_7d: string;
  volume_30d: string;
  volume_all_time: string;
}

export interface PacificaLeaderboardResponse {
  success: boolean;
  data: PacificaLeaderboardEntry[];
  error?: { message: string } | null;
  code?: string | null;
}

export interface PacificaError {
  status: number;
  message: string;
  code?: string;
}

// ============================================================================
// Error Classes
// ============================================================================

export class PacificaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly message: string,
    public readonly code?: string
  ) {
    super(`Pacifica API Error ${status}: ${message}`);
    this.name = "PacificaApiError";
  }
}

export class PacificaRateLimitError extends Error {
  constructor(
    public readonly retryAfter: number,
    message: string = "Rate limit exceeded"
  ) {
    super(message);
    this.name = "PacificaRateLimitError";
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoffDelay(attempt: number): number {
  const exponentialDelay = RATE_LIMIT.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, RATE_LIMIT.maxDelay);
}

/**
 * Check if error is rate limit related
 */
function isRateLimitError(status: number, headers?: Headers): boolean {
  return status === 429 || headers?.get("ratelimit") !== null;
}

/**
 * Parse rate limit headers to get retry-after info
 */
function parseRateLimitHeaders(headers?: Headers): { remaining?: number; resetIn?: number } {
  if (!headers) return {};

  const rateLimitHeader = headers.get("ratelimit");
  if (!rateLimitHeader) return {};

  // Format: "credits";r=1200;t=32
  const match = rateLimitHeader.match(/r=(\d+);t=(\d+)/);
  if (match) {
    return {
      remaining: parseInt(match[1]) / 10, // Divide by 10 as per docs
      resetIn: parseInt(match[2]),
    };
  }

  return {};
}

// ============================================================================
// Core Request Function
// ============================================================================

/**
 * Make a request to Pacifica API with retry logic
 */
async function pacificaRequest<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RATE_LIMIT.maxRetries; attempt++) {
    try {
      // Build URL with query params
      const url = new URL(`${BASE_URL}${endpoint}`);
      
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        });
      }

      // Build headers
      const headers: HeadersInit = {
        "Accept": "*/*",
        "Content-Type": "application/json",
      };

      // Add API key if available (for higher rate limits)
      if (API_KEY) {
        headers["X-API-Key"] = API_KEY;
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
      });

      // Parse response
      const data = await response.json();

      // Check for API-level errors
      if (!data.success && data.error) {
        throw new PacificaApiError(
          response.status,
          data.error.message || "Unknown API error",
          data.code
        );
      }

      // Check for HTTP errors
      if (!response.ok) {
        if (isRateLimitError(response.status, response.headers)) {
          const rateInfo = parseRateLimitHeaders(response.headers);
          throw new PacificaRateLimitError(
            rateInfo.resetIn || 60,
            `Rate limit exceeded. ${rateInfo.remaining ?? "?"} credits remaining.`
          );
        }
        throw new PacificaApiError(
          response.status,
          data.error?.message || response.statusText
        );
      }

      return data as T;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on rate limit errors - just wait and retry once
      if (error instanceof PacificaRateLimitError) {
        if (attempt < RATE_LIMIT.maxRetries) {
          const waitTime = error.retryAfter * 1000;
          console.warn(`[Pacifica] Rate limited. Waiting ${waitTime}ms before retry...`);
          await sleep(waitTime);
          continue;
        }
        break;
      }

      // Don't retry on API errors (4xx)
      if (error instanceof PacificaApiError && error.status >= 400 && error.status < 500) {
        break;
      }

      // Retry on network errors or 5xx
      if (attempt < RATE_LIMIT.maxRetries) {
        const delay = calculateBackoffDelay(attempt);
        console.warn(`[Pacifica] Request failed (attempt ${attempt + 1}). Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error("Pacifica API request failed after all retries");
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Get current positions for a trader account
 * 
 * @param account - Wallet address of the trader
 * @returns Array of open positions
 */
export async function getPositions(account: string): Promise<PacificaPosition[]> {
  const response = await pacificaRequest<PacificaPositionsResponse>("/api/v1/positions", {
    account,
  });
  return response.data || [];
}

/**
 * Get account info for a trader
 * 
 * @param account - Wallet address of the trader
 * @returns Account information including balance, fees, equity
 */
export async function getAccountInfo(account: string): Promise<PacificaAccountInfo | null> {
  const response = await pacificaRequest<PacificaAccountResponse>("/api/v1/account", {
    account,
  });
  return response.data || null;
}

/**
 * Get trade history for a trader
 * 
 * @param account - Wallet address of the trader
 * @param options - Optional filters
 * @returns Array of trades with pagination info
 */
export async function getTradeHistory(
  account: string,
  options?: {
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    cursor?: string;
  }
): Promise<{ trades: PacificaTrade[]; nextCursor?: string; hasMore: boolean }> {
  const response = await pacificaRequest<PacificaTradeHistoryResponse>("/api/v1/trades/history", {
    account,
    symbol: options?.symbol,
    start_time: options?.startTime,
    end_time: options?.endTime,
    limit: options?.limit || 100,
    cursor: options?.cursor,
  });
  
  return {
    trades: response.data || [],
    nextCursor: response.next_cursor,
    hasMore: response.has_more,
  };
}

/**
 * Get market info for all trading pairs
 * 
 * @returns Array of market information
 */
export async function getMarketInfo(): Promise<PacificaMarketInfo[]> {
  const response = await pacificaRequest<PacificaMarketInfoResponse>("/api/v1/info");
  return response.data || [];
}

/**
 * Calculate trader performance metrics from trade history
 * 
 * @param account - Wallet address of the trader
 * @param limit - Number of trades to analyze (default: 100)
 * @returns Performance metrics
 */
export async function getTraderPerformance(account: string, limit: number = 100) {
  const { trades } = await getTradeHistory(account, { limit });

  if (trades.length === 0) {
    return {
      totalPnl: 0,
      winRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      avgWin: 0,
      avgLoss: 0,
      largestWin: 0,
      largestLoss: 0,
    };
  }

  // Calculate metrics from closing trades only
  const closingTrades = trades.filter(
    (t) => t.side === "close_long" || t.side === "close_short"
  );

  const pnls = closingTrades.map((t) => parseFloat(t.pnl) || 0);
  const winningTrades = pnls.filter((pnl) => pnl > 0);
  const losingTrades = pnls.filter((pnl) => pnl <= 0);

  const totalPnl = pnls.reduce((sum, pnl) => sum + pnl, 0);
  const winRate = closingTrades.length > 0 ? (winningTrades.length / closingTrades.length) * 100 : 0;

  return {
    totalPnl,
    winRate,
    totalTrades: closingTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    avgWin: winningTrades.length > 0 ? winningTrades.reduce((a, b) => a + b, 0) / winningTrades.length : 0,
    avgLoss: losingTrades.length > 0 ? losingTrades.reduce((a, b) => a + b, 0) / losingTrades.length : 0,
    largestWin: Math.max(0, ...pnls),
    largestLoss: Math.min(0, ...pnls),
  };
}

/**
 * Get leaderboard - top traders ranked by equity
 *
 * @param limit - Number of traders (10, 100, or 25000)
 * @returns Array of leaderboard entries with addresses and stats
 */
export async function getLeaderboard(limit: 10 | 100 | 25000 = 100): Promise<PacificaLeaderboardEntry[]> {
  const response = await pacificaRequest<PacificaLeaderboardResponse>("/api/v1/leaderboard", {
    limit,
  });
  return response.data || [];
}

// ============================================================================
// Exports
// ============================================================================

export const pacifica = {
  getPositions,
  getAccountInfo,
  getTradeHistory,
  getMarketInfo,
  getTraderPerformance,
  getLeaderboard,
};

export default pacifica;
