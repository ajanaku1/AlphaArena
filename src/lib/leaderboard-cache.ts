/**
 * Leaderboard Cache
 *
 * In-memory cache for the full Pacifica testnet leaderboard.
 * Fetches all entries, parses string values to numbers, and caches with 60s TTL.
 * Serves stale data if the upstream API fails.
 */

import type { PacificaLeaderboardEntry } from "./pacifica-client";

const BASE_URL = process.env.PACIFICA_API_BASE || "https://test-api.pacifica.fi";
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export interface ParsedLeaderboardEntry {
  address: string;
  username: string | null;
  pnl_1d: number;
  pnl_7d: number;
  pnl_30d: number;
  pnl_all_time: number;
  equity_current: number;
  oi_current: number;
  volume_1d: number;
  volume_7d: number;
  volume_30d: number;
  volume_all_time: number;
}

interface CacheState {
  data: ParsedLeaderboardEntry[];
  cachedAt: number;
  totalTraders: number;
}

let cache: CacheState | null = null;
let fetchPromise: Promise<ParsedLeaderboardEntry[]> | null = null;

function parseEntry(entry: PacificaLeaderboardEntry): ParsedLeaderboardEntry {
  return {
    address: entry.address,
    username: entry.username || null,
    pnl_1d: parseFloat(entry.pnl_1d) || 0,
    pnl_7d: parseFloat(entry.pnl_7d) || 0,
    pnl_30d: parseFloat(entry.pnl_30d) || 0,
    pnl_all_time: parseFloat(entry.pnl_all_time) || 0,
    equity_current: parseFloat(entry.equity_current) || 0,
    oi_current: parseFloat(entry.oi_current) || 0,
    volume_1d: parseFloat(entry.volume_1d) || 0,
    volume_7d: parseFloat(entry.volume_7d) || 0,
    volume_30d: parseFloat(entry.volume_30d) || 0,
    volume_all_time: parseFloat(entry.volume_all_time) || 0,
  };
}

async function fetchLeaderboardFromAPI(): Promise<ParsedLeaderboardEntry[]> {
  const allEntries: PacificaLeaderboardEntry[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`${BASE_URL}/api/v1/leaderboard`);
    url.searchParams.set("limit", "25000");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      headers: { Accept: "*/*" },
    });

    if (!response.ok) {
      throw new Error(`Pacifica API error: ${response.status}`);
    }

    const json = await response.json();

    if (json.data && Array.isArray(json.data)) {
      allEntries.push(...json.data);
    }

    hasMore = json.has_more === true;
    cursor = json.next_cursor;

    // Safety: stop after 5 pages to avoid infinite loops
    if (allEntries.length > 100000) break;
  }

  return allEntries.map(parseEntry);
}

export async function getLeaderboardData(): Promise<CacheState> {
  const now = Date.now();

  // Return fresh cache if available
  if (cache && now - cache.cachedAt < CACHE_TTL_MS) {
    return cache;
  }

  // Deduplicate concurrent fetches
  if (!fetchPromise) {
    fetchPromise = fetchLeaderboardFromAPI().finally(() => {
      fetchPromise = null;
    });
  }

  try {
    const data = await fetchPromise;
    cache = {
      data,
      cachedAt: Date.now(),
      totalTraders: data.length,
    };
    return cache;
  } catch (error) {
    console.error("[LeaderboardCache] Fetch failed:", error);
    // Serve stale cache if upstream fails
    if (cache) {
      console.warn("[LeaderboardCache] Serving stale cache");
      return cache;
    }
    throw error;
  }
}
