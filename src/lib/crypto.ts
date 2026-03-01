/**
 * Encryption utilities for sensitive data (agent wallet private keys).
 *
 * Uses AES-256-GCM with a key from AGENT_WALLET_ENCRYPTION_KEY env var.
 * Falls back to plaintext in development when no key is configured.
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.AGENT_WALLET_ENCRYPTION_KEY;
  if (!keyHex || keyHex === "your-256-bit-hex-key") {
    return null;
  }

  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    console.warn(
      "[Crypto] AGENT_WALLET_ENCRYPTION_KEY must be 64 hex chars (32 bytes). Falling back to plaintext."
    );
    return null;
  }
  return key;
}

/**
 * Encrypt a string value. Returns "enc:<iv>:<authTag>:<ciphertext>" or the
 * plaintext prefixed with "raw:" when no encryption key is configured.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    return `raw:${plaintext}`;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `enc:${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a value produced by encrypt(). Handles both "enc:" (encrypted)
 * and "raw:" (plaintext fallback) prefixes, plus bare strings for
 * backwards compatibility with existing unencrypted data.
 */
export function decrypt(stored: string): string {
  if (stored.startsWith("raw:")) {
    return stored.slice(4);
  }

  if (!stored.startsWith("enc:")) {
    // Backwards compatibility: treat as bare plaintext (pre-encryption data)
    return stored;
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      "Cannot decrypt: AGENT_WALLET_ENCRYPTION_KEY is not configured"
    );
  }

  const parts = stored.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted format");
  }

  const [, ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
