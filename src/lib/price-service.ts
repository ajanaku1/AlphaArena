/**
 * Price Service
 *
 * Fetches real crypto prices from CoinGecko free API.
 * In-memory cache with configurable TTL.
 * Maps Pacifica symbols to CoinGecko IDs.
 */

// Symbol to CoinGecko ID mapping
const SYMBOL_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  AVAX: "avalanche-2",
  ARB: "arbitrum",
  OP: "optimism",
  MATIC: "matic-network",
  DOGE: "dogecoin",
  LINK: "chainlink",
  UNI: "uniswap",
  AAVE: "aave",
  CRV: "curve-dao-token",
  MKR: "maker",
  LDO: "lido-dao",
  APT: "aptos",
  SUI: "sui",
  SEI: "sei-network",
  TIA: "celestia",
  JUP: "jupiter-exchange-solana",
  W: "wormhole",
  WIF: "dogwifcoin",
  BONK: "bonk",
  JTO: "jito-governance-token",
  PYTH: "pyth-network",
  RNDR: "render-token",
  INJ: "injective-protocol",
  FTM: "fantom",
  NEAR: "near",
  ATOM: "cosmos",
  DOT: "polkadot",
  ADA: "cardano",
  XRP: "ripple",
  BNB: "binancecoin",
  PEPE: "pepe",
  SHIB: "shiba-inu",
  FLOKI: "floki",
  WLD: "worldcoin-wld",
  STRK: "starknet",
  MANTA: "manta-network",
  DYM: "dymension",
  TRX: "tron",
  TON: "the-open-network",
};

interface PriceCache {
  prices: Map<string, number>;
  lastFetch: number;
}

const cache: PriceCache = {
  prices: new Map(),
  lastFetch: 0,
};

const CACHE_TTL = 30_000; // 30 seconds

/**
 * Fetch current prices from CoinGecko
 */
async function fetchPrices(): Promise<Map<string, number>> {
  const coingeckoIds = Object.values(SYMBOL_MAP).join(",");

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=usd`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    const priceMap = new Map<string, number>();

    // Map CoinGecko IDs back to Pacifica symbols
    for (const [symbol, coingeckoId] of Object.entries(SYMBOL_MAP)) {
      const price = data[coingeckoId]?.usd;
      if (price) {
        priceMap.set(symbol, price);
      }
    }

    return priceMap;
  } catch (error) {
    console.warn("[PriceService] Failed to fetch prices from CoinGecko:", error);
    return new Map();
  }
}

/**
 * Get current prices for all supported symbols.
 * Uses in-memory cache with 30s TTL.
 */
export async function getCurrentPrices(): Promise<Map<string, number>> {
  const now = Date.now();

  if (now - cache.lastFetch < CACHE_TTL && cache.prices.size > 0) {
    return cache.prices;
  }

  const prices = await fetchPrices();

  if (prices.size > 0) {
    cache.prices = prices;
    cache.lastFetch = now;
  }

  return cache.prices.size > 0 ? cache.prices : prices;
}

/**
 * Get price for a single symbol.
 * Falls back to the provided entry price if unavailable.
 */
export async function getPrice(symbol: string, fallbackPrice?: number): Promise<number> {
  const prices = await getCurrentPrices();
  return prices.get(symbol) ?? fallbackPrice ?? 0;
}

/**
 * Get all supported symbols
 */
export function getSupportedSymbols(): string[] {
  return Object.keys(SYMBOL_MAP);
}
