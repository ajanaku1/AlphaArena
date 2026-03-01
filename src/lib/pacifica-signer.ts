/**
 * Pacifica API Message Signing
 *
 * Implements Pacifica's ed25519 signing protocol:
 * 1. Construct header (type, timestamp, expiry_window)
 * 2. Merge with payload as {…header, data: payload}
 * 3. Recursively sort all keys, serialize as compact JSON
 * 4. Sign UTF-8 bytes with ed25519
 * 5. Base58-encode the signature
 *
 * Reference: https://github.com/pacifica-fi/python-sdk
 */

import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

// ============================================================================
// Types
// ============================================================================

export interface SignatureHeader {
  type: string;
  timestamp: number;
  expiry_window: number;
}

export interface SignedMessage {
  message: string; // The compact JSON string that was signed
  signature: string; // Base58-encoded ed25519 signature
  timestamp: number;
  expiryWindow: number;
}

export interface SignedRequest {
  account: string;
  signature: string;
  timestamp: number;
  expiry_window: number;
  agent_wallet?: string;
}

// ============================================================================
// Core Signing Functions
// ============================================================================

/**
 * Recursively sort all keys in an object for deterministic serialization.
 * Matches Pacifica's Python SDK: sort_json_keys()
 */
export function sortKeysRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysRecursively);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysRecursively(
        (value as Record<string, unknown>)[key]
      );
    }
    return sorted;
  }
  return value;
}

/**
 * Prepare the message string to be signed.
 *
 * Format: compact JSON of sorted {type, timestamp, expiry_window, data: payload}
 * The separators must be compact (no spaces) — matches Python's json.dumps(separators=(",", ":"))
 */
export function prepareMessage(
  type: string,
  payload: Record<string, unknown>,
  timestamp?: number,
  expiryWindow: number = 5_000
): { message: string; header: SignatureHeader } {
  const header: SignatureHeader = {
    type,
    timestamp: timestamp ?? Date.now(),
    expiry_window: expiryWindow,
  };

  const data = {
    ...header,
    data: payload,
  };

  const sorted = sortKeysRecursively(data);

  // Compact JSON — no spaces after separators
  const message = JSON.stringify(sorted);

  return { message, header };
}

/**
 * Sign a message with an ed25519 keypair.
 *
 * @param keypair - Solana Keypair (contains ed25519 secret key)
 * @param type - The operation type (e.g., "create_market_order", "bind_agent_wallet")
 * @param payload - The operation-specific payload
 * @returns Signed message with base58 signature
 */
export function signMessage(
  keypair: Keypair,
  type: string,
  payload: Record<string, unknown>,
  expiryWindow: number = 5_000
): SignedMessage {
  const { message, header } = prepareMessage(
    type,
    payload,
    undefined,
    expiryWindow
  );

  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signature = bs58.encode(signatureBytes);

  return {
    message,
    signature,
    timestamp: header.timestamp,
    expiryWindow: header.expiry_window,
  };
}

/**
 * Build a complete signed request ready to send to Pacifica API.
 *
 * @param keypair - The signing keypair (agent wallet keypair for delegated trading)
 * @param account - The user's wallet address (Pacifica account)
 * @param type - Operation type
 * @param payload - Operation-specific payload
 * @param agentWallet - Optional agent wallet public key (for delegated trading)
 * @returns Object with request headers + merged body fields
 */
export function buildSignedRequest(
  keypair: Keypair,
  account: string,
  type: string,
  payload: Record<string, unknown>,
  agentWallet?: string
): { body: Record<string, unknown> } {
  const signed = signMessage(keypair, type, payload);

  const requestHeader: SignedRequest = {
    account,
    signature: signed.signature,
    timestamp: signed.timestamp,
    expiry_window: signed.expiryWindow,
    ...(agentWallet && { agent_wallet: agentWallet }),
  };

  return {
    body: {
      ...requestHeader,
      ...payload,
    },
  };
}

/**
 * Build the bind_agent_wallet message that the user needs to sign with their wallet.
 *
 * This is used in the agent wallet setup flow:
 * 1. Server generates an agent keypair
 * 2. Server builds this message
 * 3. User signs it with their Solana wallet (signMessage)
 * 4. Server sends the user's signature to Pacifica /api/v1/agent/bind
 *
 * @param agentPublicKey - The agent wallet's public key (base58)
 * @returns The exact message bytes the user must sign
 */
export function buildBindMessage(
  agentPublicKey: string,
  timestamp?: number,
  expiryWindow: number = 5_000
): { message: string; messageBytes: Uint8Array; timestamp: number; expiryWindow: number } {
  const ts = timestamp ?? Date.now();

  const { message } = prepareMessage(
    "bind_agent_wallet",
    { agent_wallet: agentPublicKey },
    ts,
    expiryWindow
  );

  return {
    message,
    messageBytes: new TextEncoder().encode(message),
    timestamp: ts,
    expiryWindow,
  };
}

// ============================================================================
// Utility: Keypair helpers
// ============================================================================

/**
 * Generate a new random keypair for use as an agent wallet.
 */
export function generateAgentKeypair(): {
  keypair: Keypair;
  publicKey: string;
  secretKeyBase58: string;
} {
  const keypair = Keypair.generate();
  return {
    keypair,
    publicKey: keypair.publicKey.toBase58(),
    secretKeyBase58: bs58.encode(keypair.secretKey),
  };
}

/**
 * Restore a Keypair from a base58-encoded secret key.
 */
export function keypairFromSecretKey(secretKeyBase58: string): Keypair {
  const secretKey = bs58.decode(secretKeyBase58);
  return Keypair.fromSecretKey(secretKey);
}
