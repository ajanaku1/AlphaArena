"use client";

import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function useWallet() {
  const {
    publicKey,
    connected,
    connecting,
    disconnect,
    wallet,
    signMessage,
  } = useSolanaWallet();
  const { setVisible } = useWalletModal();

  const walletAddress = publicKey?.toBase58() ?? null;

  return {
    ready: true,
    authenticated: connected,
    connecting,
    walletAddress,
    walletName: wallet?.adapter.name ?? null,
    signMessage: signMessage ?? null,
    login: () => setVisible(true),
    logout: disconnect,
  };
}
