"use client";

import Link from "next/link";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Wallet,
  Gift,
  LogOut,
  TrendingUp,
  Copy,
} from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WalletConnect() {
  const { authenticated, connecting, walletAddress, walletName, login, logout } =
    useWallet();

  if (connecting) {
    return (
      <button disabled className="flex items-center gap-2 px-4 py-1.5 border border-[#222] text-[10px] uppercase tracking-[1.5px] text-muted-foreground opacity-60">
        <Wallet className="h-3.5 w-3.5 animate-pulse" />
        Connecting...
      </button>
    );
  }

  if (!authenticated || !walletAddress) {
    return (
      <button
        onClick={login}
        className="flex items-center gap-2 px-4 py-1.5 border border-lime text-lime text-[10px] font-semibold uppercase tracking-[1.5px] hover:bg-lime hover:text-black transition-colors"
      >
        <Wallet className="h-3.5 w-3.5" />
        Connect
      </button>
    );
  }

  const handleDisconnect = async () => {
    await logout();
    toast("Wallet disconnected");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 border border-[#222] text-[10px] uppercase tracking-[1px] text-muted-foreground hover:border-[#333] hover:text-foreground transition-colors">
          <Wallet className="h-3.5 w-3.5 text-lime" />
          <span className="hidden sm:inline-block font-mono">
            {truncateAddress(walletAddress)}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-[#0A0A0A] border-[#222] rounded-none">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <span className="font-medium text-xs">{walletName ?? "Wallet"}</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {truncateAddress(walletAddress)}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[#222]" />

        <DropdownMenuItem asChild className="rounded-none text-xs">
          <Link href="/portfolio" className="flex items-center w-full">
            <TrendingUp className="h-3.5 w-3.5 mr-2" />
            Portfolio
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="rounded-none text-xs">
          <Link href="/referrals" className="flex items-center w-full">
            <Gift className="h-3.5 w-3.5 mr-2" />
            Referrals
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="rounded-none text-xs">
          <Link href="/arena" className="flex items-center w-full">
            <Copy className="h-3.5 w-3.5 mr-2" />
            Arena
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-[#222]" />

        <DropdownMenuItem onClick={handleDisconnect} className="text-negative rounded-none text-xs">
          <LogOut className="h-3.5 w-3.5 mr-2" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
