/**
 * Fuul SDK Configuration & Utilities
 *
 * Manages Fuul referral tracking integration:
 * - SDK initialization
 * - Pageview tracking
 * - User identification
 * - Tracking link generation
 * - Referral code storage
 */

// Referral code localStorage key
const REFERRAL_STORAGE_KEY = "alpharena_referral_code";

/**
 * Store a referral code from URL params for later application on signup
 */
export function storeReferralCode(code: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(REFERRAL_STORAGE_KEY, code);
}

/**
 * Retrieve stored referral code (and optionally clear it)
 */
export function getStoredReferralCode(clear = false): string | null {
  if (typeof window === "undefined") return null;
  const code = localStorage.getItem(REFERRAL_STORAGE_KEY);
  if (clear && code) {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  }
  return code;
}

/**
 * Check URL for referral parameters (?ref= or ?af=)
 */
export function extractReferralFromURL(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("ref") || params.get("af") || null;
}

/**
 * Generate a shareable referral link
 */
export function generateReferralLink(referralCode: string): string {
  if (typeof window === "undefined") return "";
  const baseUrl = window.location.origin;
  return `${baseUrl}/?ref=${referralCode}`;
}

/**
 * Initialize Fuul SDK (safe to call multiple times)
 */
let fuulInitialized = false;

export async function initFuul(): Promise<void> {
  if (fuulInitialized) return;

  const apiKey = process.env.NEXT_PUBLIC_FUUL_API_KEY;
  if (!apiKey || apiKey === "placeholder-fuul-api-key") {
    console.log("[Fuul] No API key configured, running in local mode");
    return;
  }

  try {
    const { Fuul } = await import("@fuul/sdk");
    Fuul.init({ apiKey });
    fuulInitialized = true;
    console.log("[Fuul] SDK initialized");
  } catch (error) {
    console.warn("[Fuul] Failed to initialize SDK:", error);
  }
}

/**
 * Send pageview event to Fuul
 */
export async function sendFuulPageview(): Promise<void> {
  if (!fuulInitialized) return;

  try {
    const { Fuul } = await import("@fuul/sdk");
    await Fuul.sendPageview();
  } catch (error) {
    console.warn("[Fuul] Failed to send pageview:", error);
  }
}

/**
 * Identify user with Fuul (call on wallet connect).
 * Uses Solana address identifier type for attribution.
 */
export async function identifyFuulUser(walletAddress: string): Promise<void> {
  if (!fuulInitialized) return;

  try {
    const { Fuul, UserIdentifierType } = await import("@fuul/sdk");
    await Fuul.identifyUser({
      identifier: walletAddress,
      identifierType: UserIdentifierType.SolanaAddress,
    });
    console.log("[Fuul] User identified:", walletAddress.slice(0, 8) + "...");
  } catch (error) {
    console.warn("[Fuul] Failed to identify user:", error);
  }
}

/**
 * Send a custom event to Fuul (e.g., first trade, volume milestone)
 */
export async function sendFuulEvent(
  name: string,
  args?: Record<string, unknown>
): Promise<void> {
  if (!fuulInitialized) return;

  try {
    const { Fuul } = await import("@fuul/sdk");
    await Fuul.sendEvent(name, args);
    console.log("[Fuul] Event sent:", name);
  } catch (error) {
    console.warn("[Fuul] Failed to send event:", error);
  }
}
