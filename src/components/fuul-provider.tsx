"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  initFuul,
  sendFuulPageview,
  extractReferralFromURL,
  storeReferralCode,
} from "@/lib/fuul";

/**
 * Inner component that uses useSearchParams() with its own Suspense boundary.
 * This prevents the entire app from suspending on navigation.
 */
function FuulReferralDetector() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = extractReferralFromURL();
    if (code) {
      storeReferralCode(code);
      console.log("[Fuul] Referral code detected and stored:", code);
    }
  }, [searchParams]);

  return null;
}

/**
 * FuulProvider
 *
 * Handles Fuul SDK lifecycle:
 * 1. Initialize SDK on mount
 * 2. Send pageview on every route change
 * 3. Detect referral codes from URL params (?ref= or ?af=)
 * 4. Store referral codes in localStorage for later application
 */
export function FuulProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const initialized = useRef(false);

  // Initialize Fuul SDK once
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initFuul();
    }
  }, []);

  // Send pageview on route changes
  useEffect(() => {
    sendFuulPageview();
  }, [pathname]);

  return (
    <>
      <Suspense fallback={null}>
        <FuulReferralDetector />
      </Suspense>
      {children}
    </>
  );
}
