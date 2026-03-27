"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export function MobileGate({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    setIsMobile(mobileUA);
    setChecked(true);
  }, []);

  // Before check completes, show children (SSR default)
  if (!checked) return <>{children}</>;

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center px-8 text-center">
        {/* Background effects */}
        <div className="grid-bg-fixed" />
        <div className="absolute inset-0 bg-gradient-to-b from-lime/5 via-transparent to-transparent" />

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm">
          <Image
            src="/logo.png"
            alt="AlphaArena"
            width={80}
            height={80}
            className="h-20 w-20 object-contain"
          />

          <h1 className="text-2xl font-bold font-display text-foreground">
            Desktop Only
          </h1>

          <p className="text-sm text-muted-foreground leading-relaxed">
            AlphaArena is currently available on desktop only. We&apos;re building
            a mobile experience — stay tuned.
          </p>

          <div className="mt-4 flex items-center gap-2 px-4 py-2 border border-[#222] rounded-lg bg-[#0a0a0a]">
            <div className="w-1.5 h-1.5 bg-lime rounded-full animate-pulse" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px]">
              Mobile app coming soon
            </span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
