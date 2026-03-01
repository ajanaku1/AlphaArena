/**
 * Agent Wallet Service
 *
 * Manages the lifecycle of Pacifica agent wallets:
 * - Generate keypair and store in DB
 * - Build the bind message for user to sign
 * - Complete binding on Pacifica after user signs
 * - Load agent wallet for trade execution
 * - Revoke agent wallet
 */

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  generateAgentKeypair,
  keypairFromSecretKey,
  buildBindMessage,
} from "@/lib/pacifica-signer";
import {
  bindAgentWallet as pacificaBindAgent,
  revokeAgentWallet as pacificaRevokeAgent,
} from "@/lib/pacifica-trading-client";
import type { Keypair } from "@solana/web3.js";

// ============================================================================
// Types
// ============================================================================

export interface InitiateBindingResult {
  success: boolean;
  agentPublicKey: string;
  messageToSign: string; // Compact JSON the user must sign with their wallet
  messageBytes: string; // Base64-encoded bytes for wallet.signMessage()
  timestamp: number;
  expiryWindow: number;
  error?: string;
}

export interface CompleteBindingResult {
  success: boolean;
  agentPublicKey?: string;
  error?: string;
}

export interface AgentWalletInfo {
  keypair: Keypair;
  publicKey: string;
  userWalletAddress: string;
  agentWalletId: string;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Step 1: Generate an agent wallet and prepare the bind message.
 *
 * Returns the message the user must sign with their Solana wallet.
 * The keypair is stored in the DB with status PENDING.
 */
export async function initiateBinding(
  userId: string,
  walletAddress: string
): Promise<InitiateBindingResult> {
  // Check for existing active agent wallet
  const existing = await prisma.agentWallet.findUnique({
    where: { userId },
  });

  if (existing && existing.status === "ACTIVE") {
    return {
      success: false,
      agentPublicKey: existing.agentPublicKey,
      messageToSign: "",
      messageBytes: "",
      timestamp: 0,
      expiryWindow: 0,
      error: "Agent wallet already active. Revoke it first to create a new one.",
    };
  }

  // Delete any existing PENDING wallet
  if (existing && existing.status === "PENDING") {
    await prisma.agentWallet.delete({ where: { id: existing.id } });
  }

  // Generate a new agent keypair
  const { publicKey, secretKeyBase58 } = generateAgentKeypair();

  // Build the bind message
  const { message, messageBytes, timestamp, expiryWindow } =
    buildBindMessage(publicKey);

  // Store in DB with encrypted secret key
  await prisma.agentWallet.create({
    data: {
      userId,
      agentPublicKey: publicKey,
      agentSecretKey: encrypt(secretKeyBase58),
      userWalletAddress: walletAddress,
      status: "PENDING",
      pacificaBound: false,
    },
  });

  // Convert messageBytes to base64 for transport to frontend
  const messageBytesBase64 = Buffer.from(messageBytes).toString("base64");

  return {
    success: true,
    agentPublicKey: publicKey,
    messageToSign: message,
    messageBytes: messageBytesBase64,
    timestamp,
    expiryWindow,
  };
}

/**
 * Step 2: Complete the agent wallet binding after user has signed.
 *
 * Submits the bind request to Pacifica's /api/v1/agent/bind endpoint
 * using the user's signature.
 *
 * IMPORTANT: The timestamp and expiryWindow must match exactly what was
 * used to build the message the user signed in step 1.
 */
export async function completeBinding(
  userId: string,
  userSignature: string,
  timestamp: number,
  expiryWindow: number
): Promise<CompleteBindingResult> {
  // Load the pending agent wallet
  const agentWallet = await prisma.agentWallet.findUnique({
    where: { userId },
  });

  if (!agentWallet) {
    return { success: false, error: "No pending agent wallet found. Initiate binding first." };
  }

  if (agentWallet.status === "ACTIVE") {
    return { success: true, agentPublicKey: agentWallet.agentPublicKey };
  }

  if (agentWallet.status !== "PENDING") {
    return { success: false, error: `Agent wallet is in ${agentWallet.status} state.` };
  }

  // Submit bind to Pacifica using the SAME timestamp the user signed
  const result = await pacificaBindAgent({
    account: agentWallet.userWalletAddress,
    agentPublicKey: agentWallet.agentPublicKey,
    signature: userSignature,
    timestamp,
    expiryWindow,
  });

  if (!result.success) {
    console.error("[AgentWallet] Pacifica bind failed:", result.error);
    return {
      success: false,
      error: result.error || "Failed to bind agent wallet on Pacifica",
    };
  }

  // Update DB
  await prisma.agentWallet.update({
    where: { id: agentWallet.id },
    data: {
      status: "ACTIVE",
      pacificaBound: true,
    },
  });

  // Update user's trading mode
  await prisma.user.update({
    where: { id: userId },
    data: { tradingMode: "LIVE" },
  });

  console.log(
    `[AgentWallet] Successfully bound agent wallet for user ${userId}`
  );

  return {
    success: true,
    agentPublicKey: agentWallet.agentPublicKey,
  };
}

/**
 * Get the active agent wallet for a user.
 * Returns the keypair needed for signing orders.
 */
export async function getAgentWallet(
  userId: string
): Promise<AgentWalletInfo | null> {
  const agentWallet = await prisma.agentWallet.findUnique({
    where: { userId },
  });

  if (!agentWallet || agentWallet.status !== "ACTIVE") {
    return null;
  }

  const decryptedKey = decrypt(agentWallet.agentSecretKey);
  const keypair = keypairFromSecretKey(decryptedKey);

  return {
    keypair,
    publicKey: agentWallet.agentPublicKey,
    userWalletAddress: agentWallet.userWalletAddress,
    agentWalletId: agentWallet.id,
  };
}

/**
 * Check if a user has an active agent wallet.
 */
export async function hasActiveAgentWallet(userId: string): Promise<boolean> {
  const count = await prisma.agentWallet.count({
    where: { userId, status: "ACTIVE" },
  });
  return count > 0;
}

/**
 * Get agent wallet status for a user.
 */
export async function getAgentWalletStatus(userId: string): Promise<{
  hasAgentWallet: boolean;
  status?: string;
  agentPublicKey?: string;
}> {
  const agentWallet = await prisma.agentWallet.findUnique({
    where: { userId },
  });

  if (!agentWallet) {
    return { hasAgentWallet: false };
  }

  return {
    hasAgentWallet: agentWallet.status === "ACTIVE",
    status: agentWallet.status,
    agentPublicKey: agentWallet.agentPublicKey,
  };
}

/**
 * Revoke an agent wallet.
 * Attempts to revoke on Pacifica first, then updates DB.
 */
export async function revokeAgentWalletForUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const agentWallet = await prisma.agentWallet.findUnique({
    where: { userId },
  });

  if (!agentWallet) {
    return { success: false, error: "No agent wallet found" };
  }

  // Try to revoke on Pacifica (best effort)
  if (agentWallet.pacificaBound) {
    try {
      const decryptedKey = decrypt(agentWallet.agentSecretKey);
      const keypair = keypairFromSecretKey(decryptedKey);
      await pacificaRevokeAgent({
        keypair,
        account: agentWallet.userWalletAddress,
        agentPublicKey: agentWallet.agentPublicKey,
      });
    } catch (error) {
      console.warn("[AgentWallet] Pacifica revoke failed (continuing):", error);
    }
  }

  // Update DB
  await prisma.agentWallet.update({
    where: { id: agentWallet.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
    },
  });

  // Reset user trading mode
  await prisma.user.update({
    where: { id: userId },
    data: { tradingMode: "SIMULATION" },
  });

  return { success: true };
}
